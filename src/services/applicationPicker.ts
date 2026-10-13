import { invoke } from '@tauri-apps/api/core';
import { targetError } from '../domain/commands.ts';
export async function pickApplicationExe(pick: () => Promise<string | null> = () => invoke('pick_application_exe')): Promise<string | null> {
  const path = await pick();
  if (path === null) return null;
  const error = targetError('program', path); if (error) throw new Error(error);
  return path;
}
