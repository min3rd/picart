import { test } from 'node:test';
import assert from 'node:assert';

test('Parse labels from OpenAI response', () => {
  const mockResponse = `{
    "labels": ["bug", "enhancement", "help wanted"],
    "comment": "Đây là một issue quan trọng cần được xử lý."
  }`;
  
  const jsonMatch = mockResponse.match(/\{[\s\S]*\}/);
  assert.ok(jsonMatch, 'Nên tìm thấy JSON trong response');
  
  const result = JSON.parse(jsonMatch[0]);
  assert.ok(Array.isArray(result.labels), 'Labels nên là một array');
  assert.strictEqual(result.labels.length, 3, 'Nên có 3 labels');
  assert.ok(result.comment, 'Nên có comment');
});

test('Filter labels by whitelist', () => {
  const whitelist = ['bug', 'enhancement', 'help wanted'];
  const suggestedLabels = ['bug', 'invalid-label', 'enhancement'];
  
  const validLabels = suggestedLabels.filter(label => whitelist.includes(label));
  
  assert.strictEqual(validLabels.length, 2, 'Nên chỉ có 2 labels hợp lệ');
  assert.deepStrictEqual(validLabels, ['bug', 'enhancement'], 'Nên lọc ra đúng labels');
});

test('Limit labels to maxLabels', () => {
  const labels = ['bug', 'enhancement', 'help wanted', 'documentation'];
  const maxLabels = 3;
  
  const limitedLabels = labels.slice(0, maxLabels);
  
  assert.strictEqual(limitedLabels.length, 3, 'Nên chỉ có tối đa 3 labels');
});

test('Check comment marker exists', () => {
  const commentMarker = '<!-- gpt5-agent-comment -->';
  const comment1 = `${commentMarker}\n🤖 Agent comment`;
  const comment2 = 'Regular user comment';
  
  assert.ok(comment1.includes(commentMarker), 'Comment1 nên chứa marker');
  assert.ok(!comment2.includes(commentMarker), 'Comment2 không nên chứa marker');
});

test('Parse JSON from response with extra text', () => {
  const responseWithExtra = `Here is the analysis:
  {
    "labels": ["bug"],
    "comment": "Test comment"
  }
  
  Hope this helps!`;
  
  const jsonMatch = responseWithExtra.match(/\{[\s\S]*\}/);
  assert.ok(jsonMatch, 'Nên tìm thấy JSON ngay cả khi có text thêm');
  
  const result = JSON.parse(jsonMatch[0]);
  assert.strictEqual(result.labels[0], 'bug', 'Nên parse đúng label');
});

test('Fallback when no JSON found', () => {
  const invalidResponse = 'This is just plain text without JSON';
  
  const jsonMatch = invalidResponse.match(/\{[\s\S]*\}/);
  
  if (!jsonMatch) {
    const fallback = {
      labels: ['help wanted'],
      comment: invalidResponse
    };
    assert.strictEqual(fallback.labels[0], 'help wanted', 'Nên dùng fallback label');
    assert.strictEqual(fallback.comment, invalidResponse, 'Nên dùng toàn bộ response làm comment');
  }
});

test('Exponential backoff calculation', () => {
  const calculateBackoff = (attempt) => Math.pow(2, attempt) * 1000;
  
  assert.strictEqual(calculateBackoff(0), 1000, 'Lần thử đầu: 1s');
  assert.strictEqual(calculateBackoff(1), 2000, 'Lần thử 2: 2s');
  assert.strictEqual(calculateBackoff(2), 4000, 'Lần thử 3: 4s');
});
