import { describe, it, expect } from 'vitest';
import { relationSentence, genderedFrench } from '../../src/utils/relationship';

describe('relationship sentence', () => {
  it('is English for English', () => {
    expect(relationSentence({ lang: 'en', a: 'TJ', b: 'Wesley', rel: 'Brother', relKey: 'brother', gender: 'male' }))
      .toBe('TJ is the brother of Wesley');
  });

  it('is French for French, with the right article and elision', () => {
    const fr = (rel, gender, b = 'Wesley') => relationSentence({ lang: 'fr', a: 'TJ', b, rel, relKey: 'x', gender });
    expect(fr('Frère', 'male')).toBe('TJ est le frère de Wesley');
    expect(fr('Sœur', 'female')).toBe('TJ est la sœur de Wesley');
    expect(fr('Oncle', 'male')).toBe("TJ est l'oncle de Wesley");
    expect(fr('Tante', 'female', 'Anne')).toBe("TJ est la tante d'Anne");
    expect(fr('Cousin(e) germain(e)', 'female')).toBe('TJ est la cousine germaine de Wesley');
    expect(fr('Cousin(e) germain(e)', 'male')).toBe('TJ est le cousin germain de Wesley');
  });

  it('is Dutch and Lingala for those languages', () => {
    expect(relationSentence({ lang: 'nl', a: 'TJ', b: 'Wesley', rel: 'Broer', relKey: 'brother', gender: 'male' })).toBe('TJ is de broer van Wesley');
    expect(relationSentence({ lang: 'nl', a: 'TJ', b: 'Wesley', rel: 'Kind', relKey: 'child', gender: 'other' })).toBe('TJ is het kind van Wesley');
    expect(relationSentence({ lang: 'ln', a: 'TJ', b: 'Wesley', rel: 'Ndeko mobali', relKey: 'brother', gender: 'male' })).toBe('TJ azali ndeko mobali ya Wesley');
  });

  it('chooses the French ending by gender', () => {
    expect(genderedFrench('Descendant(e)', 'female')).toBe('Descendante');
    expect(genderedFrench('Descendant(e)', 'other')).toBe('Descendant(e)');
  });
});
