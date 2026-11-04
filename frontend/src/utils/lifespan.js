// How the dates of a person are written when they may be unknown or only approximately known.
//   exact date                       -> 1930 (in the tree) / 14/03/1930 (in details)
//   "around that year" (approximate) -> c. 1930
//   nothing known                    -> ?
//   deceased, no death date          -> 1930 - ?
import { formatDate } from './dates';

const yearOf = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.getUTCFullYear();
};

// Someone with a death date, or marked as deceased because the date is not known
export const isDeceased = (person) => !!person && (!!person.deathDate || person.deceased === true);

export const yearText = (date, approx = false) => {
  const year = yearOf(date);
  if (year === null) return '?';
  return approx ? `c. ${year}` : String(year);
};

// "1930 - 1990", "c. 1930 - ?", "? - ?"; for a living person only the birth year (livingText can change it)
export const lifespanText = (person, livingText = (birth) => birth) => {
  const birth = yearText(person.birthDate, person.birthApprox);
  if (person.deathDate) return `${birth} - ${yearText(person.deathDate, person.deathApprox)}`;
  if (person.deceased === true) return `${birth} - ?`;
  return livingText(birth);
};

// A full date for the details of a person: dd/mm/yyyy, "c. 1930" when approximate, `empty` when unknown
export const dateText = (date, approx = false, empty = '-') => {
  if (!date) return empty;
  return approx ? yearText(date, true) : formatDate(date, empty);
};
