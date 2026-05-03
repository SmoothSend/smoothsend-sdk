import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import dts from 'rollup-plugin-dts';

const externalDeps = ['axios', 'ethers', '@aptos-labs/ts-sdk', 'react', 'react-dom', '@aptos-labs/wallet-adapter-react', 'viem', 'viem/account-abstraction', 'viem/actions'];
const external = (id) => externalDeps.some(dep => id === dep || id.startsWith(`${dep}/`));

const sharedPlugins = [
  resolve(),
  commonjs(),
  typescript({
    tsconfig: './tsconfig.json'
  })
];

export default [
  // 1. Subpath Exports (Isolated Builds)
  {
    input: {
      'avax/index': 'src/avax-entry.ts',
      'aptos/index': 'src/aptos-entry.ts',
      'stellar/index': 'src/stellar-entry.ts'
    },
    output: [
      {
        dir: 'dist',
        format: 'esm',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/shared-[hash].js',
        sourcemap: true,
        hoistTransitiveImports: false
      },
      {
        dir: 'dist',
        format: 'cjs',
        entryFileNames: '[name].cjs',
        chunkFileNames: 'chunks/shared-[hash].cjs',
        sourcemap: true
      }
    ],
    plugins: sharedPlugins,
    external
  },
  // 2. Main SDK Entry (Full Build)
  {
    input: {
      'index': 'src/index.ts'
    },
    output: [
      {
        dir: 'dist',
        format: 'esm',
        entryFileNames: '[name].js',
        sourcemap: true
      },
      {
        dir: 'dist',
        format: 'cjs',
        entryFileNames: '[name].cjs',
        sourcemap: true
      }
    ],
    plugins: sharedPlugins,
    external
  },
  // 3. Type definitions
  {
    input: {
      'index': 'dist/index.d.ts',
      'avax/index': 'dist/avax-entry.d.ts',
      'aptos/index': 'dist/aptos-entry.d.ts',
      'stellar/index': 'dist/stellar-entry.d.ts'
    },
    output: {
      dir: 'dist',
      format: 'esm',
      entryFileNames: '[name].d.ts',
      chunkFileNames: 'chunks/shared-[hash].d.ts'
    },
    plugins: [dts()],
    external
  }
];

