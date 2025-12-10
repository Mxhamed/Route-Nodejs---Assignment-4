/**
 * @param {string[]} strs
 * @return {string}
 */
function longestCommonPrefix(strs) {
  if (!strs.length) return ""; // Guard Clause

  strs.sort();
  const first = strs.at(0);
  const last = strs.at(-1);

  let res = "";

  for (let i = 0; i < first.length; i++) {
    const currentLetter = first.at(i);
    if (currentLetter === last.at(i)) res += currentLetter;
    else break;
  }

  return res;
}
