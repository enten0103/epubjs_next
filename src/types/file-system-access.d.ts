/**
 * Ambient type declarations for the File System Access API.
 *
 * The API is available in Chromium-based browsers but not yet included in
 * TypeScript's default DOM lib definitions.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker
 */

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface OpenFilePickerOptions {
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
  types?: FilePickerAcceptType[];
}

interface Window {
  showOpenFilePicker?: (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>;
}
