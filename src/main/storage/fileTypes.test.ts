import { describe, expect, it } from 'vitest';
import type { FileTypeCategory } from '@shared/ipc';
import { classifyFileTypeCategory } from './fileTypes';

const cases: [string, FileTypeCategory][] = [
  ['photo.PNG', 'Images'],
  ['pic.jpg', 'Images'],
  ['image.jpeg', 'Images'],
  ['screeshot.bmp', 'Images'],
  ['icon.webp', 'Images'],
  ['vector.svg', 'Images'],
  ['scan.tiff', 'Images'],
  ['cv.pdf', 'Documents'],
  ['report.docx', 'Documents'],
  ['sheet.xlsx', 'Documents'],
  ['notes.txt', 'Documents'],
  ['table.csv', 'Documents'],
  ['readme.md', 'Documents'],
  ['session.log', 'Documents'],
  ['clip.mp4', 'Video'],
  ['movie.mkv', 'Video'],
  ['song.mp3', 'Audio'],
  ['track.flac', 'Audio'],
  ['backup.zip', 'Archives'],
  ['app.7z', 'Archives'],
  ['archive.rar', 'Archives'],
  ['os.iso', 'Archives'],
  ['setup.exe', 'Installers'],
  ['driver.msi', 'Installers'],
  ['app.ts', 'Code'],
  ['server.py', 'Code'],
  ['styles.css', 'Code'],
  ['index.html', 'Code'],
  ['config.json', 'Code'],
  ['kernel32.dll', 'System'],
  ['driver.sys', 'System'],
  ['mystery.data', 'Other'],
  ['file.qwerty', 'Other'],
  ['archive.tar.gz', 'Archives'],
];

describe('classifyFileTypeCategory', () => {
  it('classifies by lowercased extension case-insensitively', () => {
    for (const [fileName, category] of cases) {
      expect(classifyFileTypeCategory(fileName), fileName).toBe(category);
    }
  });

  it('is consistent with a manually verified sample', () => {
    expect(classifyFileTypeCategory('photo.PNG')).toBe('Images');
    expect(classifyFileTypeCategory('report.docx')).toBe('Documents');
    expect(classifyFileTypeCategory('archive.tar.gz')).toBe('Archives');
  });
});