/** Defined age groups */
const AGE_GROUPS = [
  [0, 3],
  [4, 14],
  [15, 17],
  [18, 25],
  [26, 64],
  [65, 79],
  [80, null],
];

/**
 * Get the age of a person
 *
 * @param birthdate Date of birth of the person
 * @returns The age of the person
 */
const getAge = (birthdate: Date) => {
  const today = new Date();
  const birthDate = new Date(birthdate);
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

/**
 * Gets the age group of a person
 *
 * @param param Params object
 * @param param.age Age of the person
 * @param param.birthdate Birthdate of the person
 * @returns The age group of the person
 */
export const posterizeAge = ({
  age,
  birthdate,
}: {
  age?: number;
  birthdate?: string;
}): number | string | null => {
  if (age && typeof age === 'number') {
    // Find the age group
    const ageGroup = AGE_GROUPS.find(
      (group) => age >= group[0] && (!group[1] || age <= group[1])
    );

    // Get random age in the age group
    const min = ageGroup[0];
    const max = ageGroup[1] || 100;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  } else if (birthdate && !isNaN(new Date(birthdate).getTime())) {
    const newAge = posterizeAge({ age: getAge(new Date(birthdate)) }) as number;

    // Random month and day
    return `${new Date().getFullYear() - newAge}-${
      Math.floor(Math.random() * 11) + 1
    }-${Math.floor(Math.random() * 27) + 1}`;
  }
  return null;
};
