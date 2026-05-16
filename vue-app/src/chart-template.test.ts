import { compile } from '@vue/compiler-dom';
import { parse } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';
import chartSource from './pages/Chart.vue?raw';

describe('Chart template', () => {
  it('compiles without invalid table child warnings', () => {
    const { descriptor } = parse(chartSource, { filename: 'Chart.vue' });
    const warnings: string[] = [];

    compile(descriptor.template?.content ?? '', {
      onWarn(warning) {
        warnings.push(warning.message);
      },
    });

    expect(warnings.filter(message => message.includes('cannot be child of <table>'))).toEqual([]);
  });
});
