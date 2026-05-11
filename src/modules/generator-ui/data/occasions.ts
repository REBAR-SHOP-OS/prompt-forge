// International occasions dataset (Gregorian, MM-DD keys).
// Curated list of widely recognized international, UN, awareness and cultural days.

export type OccasionCategory = 'International' | 'UN' | 'Awareness' | 'Cultural'

export interface Occasion {
  name: string
  category: OccasionCategory
  description: string
}

export const OCCASIONS: Record<string, Occasion[]> = {
  '01-01': [{ name: "New Year's Day", category: 'International', description: 'Start of the Gregorian calendar year, celebrated worldwide.' }],
  '01-04': [{ name: 'World Braille Day', category: 'UN', description: 'Awareness of braille as a means of communication for the visually impaired.' }],
  '01-24': [{ name: 'International Day of Education', category: 'UN', description: 'Celebrating the role of education in peace and development.' }],
  '01-27': [{ name: 'International Holocaust Remembrance Day', category: 'UN', description: 'Commemorating victims of the Holocaust.' }],
  '02-04': [{ name: 'World Cancer Day', category: 'Awareness', description: 'Global awareness and prevention of cancer.' }],
  '02-06': [{ name: 'International Day of Zero Tolerance for FGM', category: 'UN', description: 'Ending female genital mutilation worldwide.' }],
  '02-11': [{ name: 'International Day of Women and Girls in Science', category: 'UN', description: 'Promoting equal participation of women in science.' }],
  '02-13': [{ name: 'World Radio Day', category: 'UN', description: 'Celebrating radio as a powerful medium for communication.' }],
  '02-14': [{ name: "Valentine's Day", category: 'Cultural', description: 'Day celebrating love and affection.' }],
  '02-20': [{ name: 'World Day of Social Justice', category: 'UN', description: 'Promoting social justice and equality.' }],
  '02-21': [{ name: 'International Mother Language Day', category: 'UN', description: 'Promoting linguistic and cultural diversity.' }],
  '03-03': [{ name: 'World Wildlife Day', category: 'UN', description: 'Celebrating wild fauna and flora.' }],
  '03-08': [{ name: "International Women's Day", category: 'UN', description: 'Celebrating the achievements of women and advocating for gender equality.' }],
  '03-14': [{ name: 'Pi Day', category: 'Cultural', description: 'Celebrating the mathematical constant π.' }],
  '03-17': [{ name: "St. Patrick's Day", category: 'Cultural', description: 'Cultural and religious celebration of Irish heritage.' }],
  '03-20': [
    { name: 'International Day of Happiness', category: 'UN', description: 'Recognizing the importance of happiness in our lives.' },
    { name: 'World Storytelling Day', category: 'Cultural', description: 'Global celebration of the art of oral storytelling.' },
  ],
  '03-21': [
    { name: 'International Day for the Elimination of Racial Discrimination', category: 'UN', description: 'Combating racism worldwide.' },
    { name: 'World Poetry Day', category: 'UN', description: 'Promoting the reading, writing, and teaching of poetry.' },
    { name: 'International Day of Forests', category: 'UN', description: 'Celebrating the importance of forests.' },
    { name: 'Nowruz', category: 'Cultural', description: 'Persian New Year and the start of spring.' },
  ],
  '03-22': [{ name: 'World Water Day', category: 'UN', description: 'Focusing on the importance of fresh water.' }],
  '03-23': [{ name: 'World Meteorological Day', category: 'UN', description: 'Awareness of weather, climate and water.' }],
  '03-24': [{ name: 'World Tuberculosis Day', category: 'Awareness', description: 'Raising awareness about TB.' }],
  '04-02': [{ name: 'World Autism Awareness Day', category: 'UN', description: 'Promoting acceptance of people with autism.' }],
  '04-07': [{ name: 'World Health Day', category: 'UN', description: 'Global health awareness, marks the founding of WHO.' }],
  '04-22': [{ name: 'Earth Day', category: 'International', description: 'Demonstrating support for environmental protection.' }],
  '04-23': [
    { name: 'World Book and Copyright Day', category: 'UN', description: 'Promoting reading, publishing, and copyright.' },
    { name: 'English Language Day', category: 'UN', description: 'Celebrating the English language.' },
  ],
  '04-25': [{ name: 'World Malaria Day', category: 'Awareness', description: 'Global effort to control malaria.' }],
  '04-26': [{ name: 'World Intellectual Property Day', category: 'UN', description: 'Awareness of patents, copyright, and trademarks.' }],
  '04-29': [{ name: 'International Dance Day', category: 'Cultural', description: 'Celebration of dance worldwide.' }],
  '04-30': [{ name: 'International Jazz Day', category: 'UN', description: 'Highlighting jazz and its diplomatic role.' }],
  '05-01': [{ name: 'International Workers’ Day', category: 'International', description: 'Labour Day, celebrating workers worldwide.' }],
  '05-03': [{ name: 'World Press Freedom Day', category: 'UN', description: 'Defending press freedom and journalists.' }],
  '05-08': [{ name: 'World Red Cross and Red Crescent Day', category: 'International', description: 'Honoring humanitarian workers.' }],
  '05-11': [{ name: 'World Migratory Bird Day', category: 'Awareness', description: 'Awareness of migratory birds and their habitats.' }],
  '05-12': [{ name: 'International Nurses Day', category: 'International', description: 'Honoring the contributions of nurses.' }],
  '05-15': [{ name: 'International Day of Families', category: 'UN', description: 'Reflecting on the importance of families.' }],
  '05-17': [{ name: 'World Telecommunication and Information Society Day', category: 'UN', description: 'Awareness of internet and ICT.' }],
  '05-20': [{ name: 'World Bee Day', category: 'UN', description: 'Awareness of the importance of bees and pollinators.' }],
  '05-21': [{ name: 'World Day for Cultural Diversity', category: 'UN', description: 'Promoting cultural diversity and dialogue.' }],
  '05-22': [{ name: 'International Day for Biological Diversity', category: 'UN', description: 'Promoting biodiversity issues.' }],
  '05-31': [{ name: 'World No Tobacco Day', category: 'UN', description: 'Highlighting the health risks of tobacco.' }],
  '06-01': [{ name: 'Global Day of Parents', category: 'UN', description: 'Honoring parents around the world.' }],
  '06-04': [{ name: 'International Day of Innocent Children Victims of Aggression', category: 'UN', description: 'Recognizing children who suffer from abuse.' }],
  '06-05': [{ name: 'World Environment Day', category: 'UN', description: 'Largest global platform for environmental outreach.' }],
  '06-08': [{ name: 'World Oceans Day', category: 'UN', description: 'Celebrating and protecting the world’s oceans.' }],
  '06-12': [{ name: 'World Day Against Child Labour', category: 'UN', description: 'Raising awareness against child labour.' }],
  '06-14': [{ name: 'World Blood Donor Day', category: 'UN', description: 'Thanking voluntary blood donors.' }],
  '06-17': [{ name: 'World Day to Combat Desertification and Drought', category: 'UN', description: 'Awareness of land degradation.' }],
  '06-20': [{ name: 'World Refugee Day', category: 'UN', description: 'Honoring refugees around the globe.' }],
  '06-21': [
    { name: 'International Day of Yoga', category: 'UN', description: 'Celebrating the practice of yoga.' },
    { name: 'World Music Day', category: 'Cultural', description: 'Global celebration of music (Fête de la Musique).' },
  ],
  '06-23': [{ name: 'United Nations Public Service Day', category: 'UN', description: 'Celebrating public servants.' }],
  '06-26': [{ name: 'International Day Against Drug Abuse', category: 'UN', description: 'Strengthening action against drug abuse.' }],
  '07-11': [{ name: 'World Population Day', category: 'UN', description: 'Awareness of global population issues.' }],
  '07-18': [{ name: 'Nelson Mandela International Day', category: 'UN', description: 'Honoring Nelson Mandela’s legacy.' }],
  '07-30': [{ name: 'International Day of Friendship', category: 'UN', description: 'Promoting friendship between peoples.' }],
  '08-09': [{ name: 'International Day of the World’s Indigenous Peoples', category: 'UN', description: 'Promoting indigenous rights.' }],
  '08-12': [{ name: 'International Youth Day', category: 'UN', description: 'Awareness of issues affecting youth.' }],
  '08-19': [{ name: 'World Humanitarian Day', category: 'UN', description: 'Honoring humanitarian workers.' }],
  '08-29': [{ name: 'International Day Against Nuclear Tests', category: 'UN', description: 'Promoting a world free of nuclear weapons.' }],
  '09-05': [{ name: 'International Day of Charity', category: 'UN', description: 'Encouraging charitable activities.' }],
  '09-08': [{ name: 'International Literacy Day', category: 'UN', description: 'Highlighting the importance of literacy.' }],
  '09-10': [{ name: 'World Suicide Prevention Day', category: 'Awareness', description: 'Promoting worldwide action to prevent suicide.' }],
  '09-15': [{ name: 'International Day of Democracy', category: 'UN', description: 'Promoting democratic principles.' }],
  '09-16': [{ name: 'International Day for the Preservation of the Ozone Layer', category: 'UN', description: 'Protecting the ozone layer.' }],
  '09-21': [{ name: 'International Day of Peace', category: 'UN', description: 'Strengthening the ideals of peace.' }],
  '09-26': [{ name: 'International Day for the Total Elimination of Nuclear Weapons', category: 'UN', description: 'Advocacy for nuclear disarmament.' }],
  '09-27': [{ name: 'World Tourism Day', category: 'International', description: 'Raising awareness of tourism’s value.' }],
  '10-01': [{ name: 'International Day of Older Persons', category: 'UN', description: 'Celebrating contributions of older people.' }],
  '10-02': [{ name: 'International Day of Non-Violence', category: 'UN', description: 'Marks Mahatma Gandhi’s birthday.' }],
  '10-04': [{ name: 'World Animal Day', category: 'Awareness', description: 'Improving welfare standards for animals.' }],
  '10-05': [{ name: 'World Teachers’ Day', category: 'UN', description: 'Celebrating teachers worldwide.' }],
  '10-10': [{ name: 'World Mental Health Day', category: 'Awareness', description: 'Raising awareness of mental health issues.' }],
  '10-11': [{ name: 'International Day of the Girl Child', category: 'UN', description: 'Promoting girls’ rights.' }],
  '10-15': [{ name: 'International Day of Rural Women', category: 'UN', description: 'Honoring rural women’s role in development.' }],
  '10-16': [{ name: 'World Food Day', category: 'UN', description: 'Action against hunger worldwide.' }],
  '10-17': [{ name: 'International Day for the Eradication of Poverty', category: 'UN', description: 'Promoting awareness of poverty.' }],
  '10-24': [{ name: 'United Nations Day', category: 'UN', description: 'Anniversary of the UN Charter entering into force.' }],
  '10-31': [
    { name: 'World Cities Day', category: 'UN', description: 'Promoting sustainable urban development.' },
    { name: 'Halloween', category: 'Cultural', description: 'Cultural celebration with costumes and traditions.' },
  ],
  '11-10': [{ name: 'World Science Day for Peace and Development', category: 'UN', description: 'Renewing the commitment to using science for peace.' }],
  '11-11': [{ name: 'Armistice / Remembrance Day', category: 'International', description: 'Commemorating the end of World War I.' }],
  '11-14': [{ name: 'World Diabetes Day', category: 'UN', description: 'Awareness of diabetes worldwide.' }],
  '11-16': [{ name: 'International Day for Tolerance', category: 'UN', description: 'Promoting tolerance and respect.' }],
  '11-19': [{ name: 'World Toilet Day', category: 'UN', description: 'Tackling the global sanitation crisis.' }],
  '11-20': [{ name: 'Universal Children’s Day', category: 'UN', description: 'Promoting children’s welfare worldwide.' }],
  '11-25': [{ name: 'International Day for the Elimination of Violence against Women', category: 'UN', description: 'Ending violence against women.' }],
  '12-01': [{ name: 'World AIDS Day', category: 'UN', description: 'Awareness of the AIDS pandemic.' }],
  '12-02': [{ name: 'International Day for the Abolition of Slavery', category: 'UN', description: 'Eradicating modern forms of slavery.' }],
  '12-03': [{ name: 'International Day of Persons with Disabilities', category: 'UN', description: 'Promoting rights and well-being of persons with disabilities.' }],
  '12-05': [{ name: 'International Volunteer Day', category: 'UN', description: 'Celebrating volunteers worldwide.' }],
  '12-10': [{ name: 'Human Rights Day', category: 'UN', description: 'Marks the adoption of the Universal Declaration of Human Rights.' }],
  '12-18': [{ name: 'International Migrants Day', category: 'UN', description: 'Promoting human rights of migrants.' }],
  '12-20': [{ name: 'International Human Solidarity Day', category: 'UN', description: 'Celebrating unity in diversity.' }],
  '12-25': [{ name: 'Christmas Day', category: 'Cultural', description: 'Christian holiday celebrating the birth of Jesus.' }],
  '12-31': [{ name: "New Year's Eve", category: 'Cultural', description: 'Last day of the year, celebrated worldwide.' }],
}

export function getOccasionsFor(date: Date): Occasion[] {
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return OCCASIONS[`${mm}-${dd}`] ?? []
}

export function hasOccasion(date: Date): boolean {
  return getOccasionsFor(date).length > 0
}
