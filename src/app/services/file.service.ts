import { Injectable } from '@angular/core';

/**
 * FileService (file-based):
 * - read project JSON from user file (open/import)
 * - save project JSON to user file (save/download)
 *
 * Implementation details:
 * - Uses the File System Access API (showOpenFilePicker / showSaveFilePicker) when available.
 * - Falls back to reading File objects (from <input type="file">) and to triggering a download
 *   via Blob/anchor when saving.
 *
 * Methods are mostly async (Promise-based) because file access is asynchronous.
 */

export interface Pixel {
  x: number;
  y: number;
  color: string;
  alpha?: number;
}

export interface PixelGrid {
  width: number;
  height: number;
  pixelSize: number;
  pixels: Pixel[];
}

export interface Frame {
  id: string;
  name?: string;
  pixelGrid: PixelGrid;
  duration: number; // ms
}

export interface Animation {
  id: string;
  name?: string;
  frames: Frame[];
  loopCount?: number;
}

export interface Sprite {
  id: string;
  name?: string;
  animations: Animation[];
  metadata?: Record<string, any>;
}

export interface Project {
  id: string;
  name: string;
  created: string; // ISO date
  modified: string; // ISO date
  sprites: Sprite[];
  metadata?: Record<string, any>;
}

// Typings for the File System Access API are not guaranteed in all TS setups here,
// so we use `any` for handles (these are platform-provided objects).
type FileHandle = any;

@Injectable({ providedIn: 'root' })
export class FileService {
  // Map project.id -> file handle so we can save back to same file when possible
  private fileHandles = new Map<string, FileHandle>();

  constructor() {}

  createProject(name: string): Project {
    const now = new Date().toISOString();
    const project: Project = {
      id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      name: name || `Project ${now}`,
      created: now,
      modified: now,
      sprites: [],
      metadata: {},
    };
    return project;
  }

  /**
   * Open a project by showing a file picker to the user.
   * Returns the parsed Project and remembers the file handle (when available) to allow saving back.
   */
  async openProjectFromPicker(): Promise<Project | null> {
    // If the File System Access API is available
    if (window && (window as any).showOpenFilePicker) {
      try {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [
            {
              description: 'PicArt project (JSON)',
              accept: { 'application/json': ['.json'] },
            },
          ],
          multiple: false,
        });

        const file = await handle.getFile();
        const text = await file.text();
        const parsed = JSON.parse(text) as Project;
        // remember handle by project id if present or by new id
        const projectId = parsed.id || `proj_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        parsed.id = projectId;
        this.fileHandles.set(projectId, handle);
        return parsed;
      } catch (e) {
        console.warn('Open project canceled or failed', e);
        return null;
      }
    }

    // Fallback: create and dispatch an <input type="file"> and read first file
    return await this.openProjectFromInputFile();
  }

  /**
   * Read project from a supplied File object (useful if the user selected a file via an <input>).
   */
  async openProjectFromFile(file: File): Promise<Project | null> {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Project;
      parsed.id = parsed.id || `proj_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      // Note: cannot obtain a persistent file handle from a plain File
      return parsed;
    } catch (e) {
      console.error('Failed to open project from file', e);
      return null;
    }
  }

  private openProjectFromInputFile(): Promise<Project | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = async () => {
        const f = input.files && input.files[0];
        if (!f) return resolve(null);
        const project = await this.openProjectFromFile(f);
        resolve(project);
      };
      input.click();
    });
  }

  /**
   * Save a project. If a file handle is known for the project, attempt to write back to it.
   * Otherwise, prompt the user to pick a save location (File System Access API) or fall back to
   * downloading a JSON file.
   */
  async saveProjectToFile(project: Project, suggestedName?: string): Promise<boolean> {
    const contents = this.projectToJson(project);

    // If we have a file handle for this project, try to write to it
    const knownHandle = this.fileHandles.get(project.id);
    if (knownHandle && knownHandle.createWritable) {
      try {
        const writable = await knownHandle.createWritable();
        await writable.write(contents);
        await writable.close();
        project.modified = new Date().toISOString();
        return true;
      } catch (e) {
        console.warn('Failed to write to known handle, will fallback to save-as', e);
      }
    }

    // If the platform supports showSaveFilePicker, use it
    if (window && (window as any).showSaveFilePicker) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: suggestedName || `${project.name || 'project'}.json`,
          types: [
            {
              description: 'PicArt project (JSON)',
              accept: { 'application/json': ['.json'] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(contents);
        await writable.close();
        // remember handle for future saves
        this.fileHandles.set(project.id, handle);
        project.modified = new Date().toISOString();
        return true;
      } catch (e) {
        console.warn('Save-as canceled or failed', e);
        // fallthrough to download fallback
      }
    }

    // Fallback: trigger a download
    this.downloadString(contents, suggestedName || `${project.name || 'project'}.json`);
    project.modified = new Date().toISOString();
    return true;
  }

  /**
   * Export project by returning JSON string or triggering a download (download preferred for file-based flow)
   */
  exportProjectToDownload(project: Project, filename?: string): void {
    const contents = this.projectToJson(project);
    this.downloadString(contents, filename || `${project.name || 'project'}.json`);
  }

  /**
   * Import a project from a selected File object (e.g., from an <input>). Returns parsed Project.
   */
  async importProjectFromFile(file: File): Promise<Project | null> {
    return this.openProjectFromFile(file);
  }

  /**
   * Convert project to JSON string (pretty-printed)
   */
  projectToJson(project: Project): string {
    return JSON.stringify(project, null, 2);
  }

  /**
   * Utility: trigger download of string content as a file
   */
  private downloadString(content: string, filename: string): void {
    try {
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to download project', e);
    }
  }

  /**
   * Clear remembered file handle for a project (not delete user's file)
   */
  clearFileHandle(projectId: string): void {
    this.fileHandles.delete(projectId);
  }
}
