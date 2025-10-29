#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Octokit } from '@octokit/rest';
import OpenAI from 'openai';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const AGENT_MODEL = process.env.AGENT_MODEL || config.modelDefault;
const AGENT_MODE = process.env.AGENT_MODE || 'triage-only';
const AGENT_ENABLED = process.env.AGENT_ENABLED !== 'false';

if (!AGENT_ENABLED) {
  console.log('Agent bị vô hiệu hóa bởi AGENT_ENABLED=false');
  process.exit(0);
}

if (!GITHUB_TOKEN) {
  console.error('Thiếu GITHUB_TOKEN');
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error('Thiếu OPENAI_API_KEY');
  process.exit(1);
}

const octokit = new Octokit({ auth: GITHUB_TOKEN });
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callOpenAIWithRetry(messages, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await openai.chat.completions.create({
        model: AGENT_MODEL,
        messages: messages,
        temperature: 0.7,
        max_tokens: 1000,
      });
      return response.choices[0].message.content;
    } catch (error) {
      console.error(`Lỗi khi gọi OpenAI (lần thử ${i + 1}/${maxRetries}):`, error.message);
      if (i < maxRetries - 1) {
        const backoffMs = Math.pow(2, i) * 1000;
        console.log(`Đợi ${backoffMs}ms trước khi thử lại...`);
        await sleep(backoffMs);
      } else {
        throw error;
      }
    }
  }
}

async function analyzeIssue(issueTitle, issueBody, issueAuthor) {
  const systemPrompt = `Bạn là một GitHub issue triage assistant chuyên nghiệp. Nhiệm vụ của bạn là:
1. Phân tích issue và đề xuất tối đa ${config.maxLabels} labels phù hợp từ danh sách: ${config.labelWhitelist.join(', ')}
2. Viết một bình luận hữu ích bằng tiếng Việt với:
   - Tóm tắt ngắn gọn vấn đề
   - Các bước tiếp theo được đề xuất (ví dụ: cần thêm thông tin, steps to reproduce, code references)
   - Gợi ý về labels và người assign nếu phù hợp

Trả về kết quả dưới dạng JSON với cấu trúc:
{
  "labels": ["label1", "label2"],
  "comment": "Nội dung comment bằng tiếng Việt"
}`;

  const userPrompt = `Issue Title: ${issueTitle}
Issue Body: ${issueBody || '(không có nội dung)'}
Issue Author: ${issueAuthor}

Hãy phân tích issue này và trả về JSON theo format đã yêu cầu.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  const response = await callOpenAIWithRetry(messages);
  
  let jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.warn('Không tìm thấy JSON trong response, sử dụng fallback');
    return {
      labels: ['help wanted'],
      comment: response
    };
  }
  
  const result = JSON.parse(jsonMatch[0]);
  
  result.labels = (result.labels || [])
    .filter(label => config.labelWhitelist.includes(label))
    .slice(0, config.maxLabels);
  
  return result;
}

async function hasAgentCommented(owner, repo, issueNumber) {
  try {
    const { data: comments } = await octokit.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber,
    });
    
    return comments.some(comment => comment.body.includes(config.commentMarker));
  } catch (error) {
    console.error('Lỗi khi kiểm tra comments:', error.message);
    return false;
  }
}

async function getRepoLabels(owner, repo) {
  try {
    const { data: labels } = await octokit.issues.listLabelsForRepo({
      owner,
      repo,
    });
    return new Set(labels.map(l => l.name));
  } catch (error) {
    console.error('Lỗi khi lấy danh sách labels:', error.message);
    return new Set();
  }
}

async function processIssue(event) {
  const { issue, repository } = event;
  const owner = repository.owner.login;
  const repo = repository.name;
  const issueNumber = issue.number;

  console.log(`Xử lý issue #${issueNumber} trong ${owner}/${repo}`);

  const alreadyCommented = await hasAgentCommented(owner, repo, issueNumber);
  if (alreadyCommented) {
    console.log('Agent đã comment trên issue này rồi, bỏ qua để tránh duplicate.');
    return;
  }

  const repoLabels = await getRepoLabels(owner, repo);
  
  console.log('Đang phân tích issue với OpenAI...');
  const analysis = await analyzeIssue(issue.title, issue.body, issue.user.login);
  
  const validLabels = analysis.labels.filter(label => repoLabels.has(label));
  
  if (validLabels.length > 0) {
    console.log(`Thêm labels: ${validLabels.join(', ')}`);
    try {
      await octokit.issues.addLabels({
        owner,
        repo,
        issue_number: issueNumber,
        labels: validLabels,
      });
    } catch (error) {
      console.error('Lỗi khi thêm labels:', error.message);
    }
  }

  const commentBody = `${config.commentMarker}
🤖 **GPT-5 Agent Triage**

${analysis.comment}

---
*Agent này được hỗ trợ bởi ${AGENT_MODEL}. Labels được đề xuất: ${validLabels.length > 0 ? validLabels.join(', ') : 'không có'}*`;

  console.log('Đăng comment...');
  try {
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: commentBody,
    });
    console.log('Comment đã được đăng thành công');
  } catch (error) {
    console.error('Lỗi khi đăng comment:', error.message);
    throw error;
  }

  if (AGENT_MODE === 'triage-and-pr' && config.enableCreatePR && issue.labels.some(l => l.name === 'needs-pr')) {
    console.log('Chế độ triage-and-pr được bật nhưng tính năng tạo PR chưa được implement');
  }
}

async function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    console.error('Thiếu GITHUB_EVENT_PATH');
    process.exit(1);
  }

  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  
  if (!event.issue) {
    console.log('Event này không chứa issue, bỏ qua');
    process.exit(0);
  }

  await processIssue(event);
  console.log('Hoàn thành xử lý issue');
}

main().catch(error => {
  console.error('Lỗi nghiêm trọng:', error);
  process.exit(1);
});
