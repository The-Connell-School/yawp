import { defineConfig, mergeConfig, type Plugin } from 'vite';
import base from './vite.config';

/** Test-only flag reads. This configuration never ships in the app build. */
function mockedFlags(): Plugin {
  if (
    process.env.SIGNON_LOCAL_TEST !== '1' ||
    !process.env.SIGNON_TEACHER_PROMPTS_MOCK_STATE
  )
    throw Error('Local teacher prompts test harness only');
  return {
    name: 'teacher-prompts-test-flags',
    enforce: 'pre',
    transform(source, id, options) {
      if (!options?.ssr) return;
      if (!id.endsWith('/domain/feature-flags/feature-flags.server.ts')) return;
      return (
        source.replace(
          /(export async function isFreeTierEnabled\([\s\S]*?\): Promise<boolean> \{)/,
          '$1\n return true;'
        )
      );
    },
  };
}

export default mergeConfig(base, defineConfig({ plugins: [mockedFlags()] }));
