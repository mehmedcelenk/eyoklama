import { describe, it, expect } from 'vitest';
import path from 'node:path';
import ts from 'typescript';
import { resolveConfig } from 'vite';
import { initApp } from '@app/bootstrap';
import '@styles/main.css';

describe('Milestone M1 Path Alias Resolution', () => {
  const rootDir = process.cwd();

  it('resolves active @app and @styles aliases at runtime and compile-time', () => {
    expect(typeof initApp).toBe('function');
  });

  it('validates tsconfig.json compilerOptions.paths definitions for all 5 layers', () => {
    const tsconfigPath = path.resolve(rootDir, 'tsconfig.json');
    const { config, error } = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    expect(error).toBeUndefined();

    const paths = config.compilerOptions.paths;
    expect(paths).toBeDefined();
    expect(paths['@app/*']).toEqual(['src/app/*']);
    expect(paths['@app']).toEqual(['src/app']);
    expect(paths['@features/*']).toEqual(['src/features/*']);
    expect(paths['@features']).toEqual(['src/features']);
    expect(paths['@data/*']).toEqual(['src/data/*']);
    expect(paths['@data']).toEqual(['src/data']);
    expect(paths['@shared/*']).toEqual(['src/shared/*']);
    expect(paths['@shared']).toEqual(['src/shared']);
    expect(paths['@styles/*']).toEqual(['src/styles/*']);
    expect(paths['@styles']).toEqual(['src/styles']);
  });

  it('validates TypeScript module resolution engine resolves paths to src/ directories', () => {
    const tsconfigPath = path.resolve(rootDir, 'tsconfig.json');
    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    const parsedCommandLine = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      rootDir
    );

    const compilerOptions = parsedCommandLine.options;
    const host = ts.createCompilerHost(compilerOptions);

    const testCases = [
      { specifier: '@app/bootstrap', expectedSubstring: 'src/app/bootstrap' },
      { specifier: '@shared/sanitization', expectedSubstring: 'src/shared/sanitization' },
      { specifier: '@data/supabase/client', expectedSubstring: 'src/data/supabase/client' },
      { specifier: '@features/auth/auth-view', expectedSubstring: 'src/features/auth/auth-view' },
      { specifier: '@styles/main.css', expectedSubstring: 'src/styles/main.css' }
    ];

    for (const { specifier, expectedSubstring } of testCases) {
      const containingFile = path.resolve(rootDir, 'src/app/test.ts');
      const resolved = ts.resolveModuleName(
        specifier,
        containingFile,
        compilerOptions,
        host
      );

      if (resolved.resolvedModule) {
        expect(resolved.resolvedModule.resolvedFileName).toContain(expectedSubstring);
      } else {
        const trace = (resolved as unknown as { failedLookupLocations?: string[] }).failedLookupLocations || [];
        const matchesTargetDir = trace.some(loc => loc.includes(expectedSubstring));
        expect(matchesTargetDir).toBe(true);
      }
    }
  });

  it('validates Vite resolve.alias configuration maps all 5 layers correctly', async () => {
    const viteConfig = await resolveConfig({ configFile: path.resolve(rootDir, 'vite.config.ts') }, 'build');
    const aliasConfig = viteConfig.resolve.alias;

    const expectedAliases = [
      { find: '@app', replacement: path.resolve(rootDir, 'src/app') },
      { find: '@features', replacement: path.resolve(rootDir, 'src/features') },
      { find: '@data', replacement: path.resolve(rootDir, 'src/data') },
      { find: '@shared', replacement: path.resolve(rootDir, 'src/shared') },
      { find: '@styles', replacement: path.resolve(rootDir, 'src/styles') }
    ];

    for (const expected of expectedAliases) {
      const match = aliasConfig.find((a: { find: string | RegExp; replacement: string }) => {
        if (typeof a.find === 'string') {
          return a.find === expected.find && a.replacement === expected.replacement;
        }
        return false;
      });
      expect(match).toBeDefined();
    }
  });
});
