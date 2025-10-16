import { readFile } from 'node:fs/promises';
import ts from 'typescript';

export async function resolve(specifier, context, defaultResolve) {
  if (specifier.endsWith('/db/prisma.js') && context.parentURL?.includes('/apps/server/src/')) {
    const url = new URL('../../dist/db/prisma.js', context.parentURL);
    return { url: url.href, shortCircuit: true };
  }
  if (specifier.endsWith('/utils/ttl-cache.js') && context.parentURL?.includes('/apps/server/src/')) {
    const url = new URL('../../dist/utils/ttl-cache.js', context.parentURL);
    return { url: url.href, shortCircuit: true };
  }
  if (specifier.endsWith('/env.js') && context.parentURL?.includes('/apps/server/src/')) {
    const url = new URL('../../src/env.ts', context.parentURL);
    return { url: url.href, shortCircuit: true };
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
