import { readFile } from 'node:fs/promises';
import ts from 'typescript';

export async function resolve(specifier, context, defaultResolve) {
  if (specifier.endsWith('.js') && context.parentURL?.includes('/apps/server/')) {
    const tsUrl = new URL(specifier.replace(/\.js$/, '.ts'), context.parentURL);
    try {
      await readFile(tsUrl);
      return { url: tsUrl.href, shortCircuit: true };
    } catch (_error) {
      // ignore and fall through
    }
  }
  return defaultResolve(specifier, context, defaultResolve);
}

export async function load(url, context, defaultLoad) {
  if (url.startsWith('file:') && url.endsWith('.ts')) {
    const source = await readFile(new URL(url), 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.Preserve,
        esModuleInterop: true,
      },
      fileName: url,
    });

    return {
      format: 'module',
      source: transpiled.outputText,
      shortCircuit: true,
    };
  }

  return defaultLoad(url, context, defaultLoad);
}
