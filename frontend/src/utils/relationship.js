// The sentence under the relationship result, in the language of the site:
// "TJ is the brother of Wesley" / "TJ est le frère de Wesley" / "TJ is de broer van Wesley".

const lower = (text) => (text ? text.charAt(0).toLowerCase() + text.slice(1) : '');
const startsWithVowel = (text) => /^[aeiouyhàâäéèêëîïôöùûü]/i.test(text);

// "Cousin(e) germain(e)" -> "Cousine germaine" or "Cousin germain", by the gender of the person
export const genderedFrench = (text, gender) => {
  if (!text) return text;
  if (gender === 'female') return text.replace(/\(e\)/g, 'e');
  if (gender === 'male') return text.replace(/\(e\)/g, '');
  return text;
};

// Dutch nouns that take "het" (the others take "de")
const DUTCH_HET = new Set([
  'child', 'grandchild', 'greatGrandchild', 'sibling', 'relative', 'stepchild', 'stepGrandchild',
  'grandchildInLaw', 'childInLaw', 'siblingInLaw', 'relativeInLaw', 'halfSibling', 'stepsibling',
  'parentInLaw', 'grandparentInLaw'
]);
const DUTCH_DE_ANYWAY = new Set(['parentInLaw', 'grandparentInLaw']); // "de schoonouder"

export const relationSentence = ({ lang, a, b, rel, relKey, gender }) => {
  const language = String(lang || 'en').slice(0, 2);
  if (language === 'fr') {
    const noun = lower(genderedFrench(rel, gender));
    let article = gender === 'female' ? 'la ' : gender === 'male' ? 'le ' : 'le/la ';
    if (gender !== 'other' && startsWithVowel(noun)) article = "l'";
    const of = startsWithVowel(b) ? "d'" : 'de ';
    return `${a} est ${article}${noun} ${of}${b}`;
  }
  if (language === 'nl') {
    const article = DUTCH_HET.has(relKey) && !DUTCH_DE_ANYWAY.has(relKey) ? 'het' : 'de';
    return `${a} is ${article} ${lower(rel)} van ${b}`;
  }
  if (language === 'ln') return `${a} azali ${lower(rel)} ya ${b}`;
  return `${a} is the ${lower(rel)} of ${b}`;
};
