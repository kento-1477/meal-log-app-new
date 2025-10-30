import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { extname } from 'node:path';
import ts from 'typescript';

const projectRoot = new URL('..', import.meta.url);

export async function resolve(specifier, context, defaultResolve) {
  if (specifier === 'expo-in-app-purchases') {
    const url = new URL('tests/stubs/expo-in-app-purchases.ts', projectRoot);
    return { url: url.href, shortCircuit: true };
  }
  if (specifier === 'expo-constants') {
    const url = new URL('tests/stubs/expo-constants.ts', projectRoot);
    return { url: url.href, shortCircuit: true };
  }
  if (specifier === 'react') {
    const url = new URL('tests/stubs/react.js', projectRoot);
    return { url: url.href, shortCircuit: true };
  }
  if (specifier === 'react/jsx-runtime' || specifier === 'react/jsx-dev-runtime') {
    const url = new URL('tests/stubs/react-jsx-runtime.js', projectRoot);
    return { url: url.href, shortCircuit: true };
  }
  if (specifier === 'react-native') {
    const url = new URL('tests/stubs/react-native.ts', projectRoot);
    return { url: url.href, shortCircuit: true };
  }
  if (specifier.startsWith('@/')) {
    const basePath = specifier.slice(2);
    const candidates = [
      `src/${basePath}.ts`,
      `src/${basePath}.tsx`,
      `src/${basePath}.js`,
      `src/${basePath}/index.ts`,
      `src/${basePath}/index.tsx`,
      `src/${basePath}/index.js`,
    ];
    for (const candidate of candidates) {
      try {
        const url = new URL(candidate, projectRoot);
        await access(url, constants.F_OK);
        return { url: url.href, shortCircuit: true };
      } catch (_error) {
        // try next candidate
      }
    }
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && extname(specifier) === '') {
    const extensions = ['.ts', '.tsx', '.js'];
    for (const ext of extensions) {
      try {
        const url = new URL(`${specifier}${ext}`, context.parentURL);
        await access(url, constants.F_OK);
        return { url: url.href, shortCircuit: true };
      } catch (_error) {
        // continue
      }
    }
  }
  return defaultResolve(specifier, context, defaultResolve);
}

export async function load(url, context, defaultLoad) {
  if (url.startsWith('file:') && (url.endsWith('.ts') || url.endsWith('.tsx'))) {
    const source = await readFile(new URL(url), 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
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
