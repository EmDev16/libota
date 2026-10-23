// Tags are typed by people, so they are cleaned the same way everywhere:
// "#Family  gathering 2018 " -> "family gathering 2018"
const isText = (v) => typeof v === 'string';

const cleanTag = (tag) =>
  (isText(tag) ? tag : '')
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 40);

class InvalidTags extends Error {}

// A list of tags: cleaned, without doubles, at most `max`
const cleanTagList = (list, max = 10) => {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) throw new InvalidTags('Invalid tags');
  const tags = [...new Set(list.map(cleanTag).filter(Boolean))];
  if (tags.length > max) throw new InvalidTags(`At most ${max} tags`);
  return tags;
};

module.exports = { cleanTag, cleanTagList, InvalidTags };
