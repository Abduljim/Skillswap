// Run with: node scripts/seed-prod.js
// Used in production to seed the database once after first deploy.
// Uses compiled Prisma client only — no TypeScript, no tsx needed at runtime.

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const SKILLS = [
  { name: 'Python', category: 'Technology' },
  { name: 'JavaScript', category: 'Technology' },
  { name: 'TypeScript', category: 'Technology' },
  { name: 'Java', category: 'Technology' },
  { name: 'C++', category: 'Technology' },
  { name: 'React', category: 'Technology' },
  { name: 'Node.js', category: 'Technology' },
  { name: 'SQL', category: 'Technology' },
  { name: 'Git', category: 'Technology' },
  { name: 'Cybersecurity', category: 'Technology' },
  { name: 'Data Analysis', category: 'Technology' },
  { name: 'Machine Learning', category: 'Technology' },
  { name: 'Photoshop', category: 'Design' },
  { name: 'Figma', category: 'Design' },
  { name: 'Illustrator', category: 'Design' },
  { name: 'Canva', category: 'Design' },
  { name: 'UI Design', category: 'Design' },
  { name: 'UX Design', category: 'Design' },
  { name: 'Motion Design', category: 'Design' },
  { name: 'Branding', category: 'Design' },
  { name: 'Mathematics', category: 'Academic' },
  { name: 'Physics', category: 'Academic' },
  { name: 'Statistics', category: 'Academic' },
  { name: 'Essay Writing', category: 'Academic' },
  { name: 'Research Methods', category: 'Academic' },
  { name: 'Photography', category: 'Creative' },
  { name: 'Video Editing', category: 'Creative' },
  { name: 'Drawing', category: 'Creative' },
  { name: 'Animation', category: 'Creative' },
  { name: 'Creative Writing', category: 'Creative' },
  { name: 'Content Creation', category: 'Creative' },
  { name: 'Marketing', category: 'Business' },
  { name: 'Sales', category: 'Business' },
  { name: 'Accounting', category: 'Business' },
  { name: 'Entrepreneurship', category: 'Business' },
  { name: 'Public Speaking', category: 'Business' },
  { name: 'French', category: 'Languages' },
  { name: 'Spanish', category: 'Languages' },
  { name: 'Mandarin', category: 'Languages' },
  { name: 'Arabic', category: 'Languages' },
  { name: 'Cooking', category: 'Lifestyle' },
  { name: 'Fitness', category: 'Lifestyle' },
  { name: 'Sewing', category: 'Lifestyle' },
  { name: 'Yoga', category: 'Lifestyle' },
  { name: 'Guitar', category: 'Music' },
  { name: 'Piano', category: 'Music' },
  { name: 'Singing', category: 'Music' },
  { name: 'Music Production', category: 'Music' },
  { name: 'Negotiation', category: 'Communication' },
  { name: 'Storytelling', category: 'Communication' },
  { name: 'Networking', category: 'Communication' },
];

const USERS = [
  { email: 'alice@example.com', displayName: 'Alice Adebayo', university: 'University of Lagos', department: 'Computer Science', yearLevel: '3rd Year', bio: 'Backend developer who loves teaching programming fundamentals.', avatarUrl: 'https://i.pravatar.cc/300?img=47', learningFormat: 'EITHER', avail: [{ weekday: 'MONDAY', timeOfDay: 'EVENING' }, { weekday: 'WEDNESDAY', timeOfDay: 'EVENING' }, { weekday: 'SATURDAY', timeOfDay: 'MORNING' }], teach: [{ name: 'Python', proficiency: 'ADVANCED' }, { name: 'SQL', proficiency: 'ADVANCED' }, { name: 'Git', proficiency: 'EXPERT' }], want: ['Figma', 'UI Design', 'Photography'], isAdmin: true },
  { email: 'bob@example.com', displayName: 'Bob Okeke', university: 'University of Lagos', department: 'Design', yearLevel: '4th Year', bio: 'Designer who wants to learn how to code.', avatarUrl: 'https://i.pravatar.cc/300?img=12', learningFormat: 'EITHER', avail: [{ weekday: 'TUESDAY', timeOfDay: 'EVENING' }, { weekday: 'THURSDAY', timeOfDay: 'EVENING' }, { weekday: 'SATURDAY', timeOfDay: 'MORNING' }], teach: [{ name: 'Figma', proficiency: 'EXPERT' }, { name: 'UI Design', proficiency: 'ADVANCED' }, { name: 'Photography', proficiency: 'INTERMEDIATE' }], want: ['Python', 'SQL', 'JavaScript'] },
  { email: 'sarah@example.com', displayName: 'Sarah Okafor', university: 'University of Ibadan', department: 'Mass Communication', yearLevel: '2nd Year', bio: 'Storyteller and content creator. Looking to improve my tech skills.', avatarUrl: 'https://i.pravatar.cc/300?img=49', learningFormat: 'ONLINE', avail: [{ weekday: 'MONDAY', timeOfDay: 'AFTERNOON' }, { weekday: 'WEDNESDAY', timeOfDay: 'AFTERNOON' }, { weekday: 'FRIDAY', timeOfDay: 'MORNING' }], teach: [{ name: 'Creative Writing', proficiency: 'EXPERT' }, { name: 'Content Creation', proficiency: 'ADVANCED' }, { name: 'Public Speaking', proficiency: 'ADVANCED' }], want: ['Photoshop', 'Video Editing', 'Photography'] },
  { email: 'david@example.com', displayName: 'David Mensah', university: 'University of Ibadan', department: 'Visual Arts', yearLevel: '3rd Year', bio: 'Photographer and editor. Want to learn to write better.', avatarUrl: 'https://i.pravatar.cc/300?img=33', learningFormat: 'IN_PERSON', avail: [{ weekday: 'MONDAY', timeOfDay: 'AFTERNOON' }, { weekday: 'WEDNESDAY', timeOfDay: 'AFTERNOON' }, { weekday: 'FRIDAY', timeOfDay: 'MORNING' }], teach: [{ name: 'Photography', proficiency: 'EXPERT' }, { name: 'Photoshop', proficiency: 'EXPERT' }, { name: 'Video Editing', proficiency: 'ADVANCED' }], want: ['Creative Writing', 'Public Speaking', 'French'] },
  { email: 'fatima@example.com', displayName: 'Fatima Bello', university: 'Ahmadu Bello University', department: 'Linguistics', yearLevel: '2nd Year', bio: 'Polyglot who loves teaching languages.', avatarUrl: 'https://i.pravatar.cc/300?img=45', learningFormat: 'ONLINE', avail: [{ weekday: 'TUESDAY', timeOfDay: 'MORNING' }, { weekday: 'THURSDAY', timeOfDay: 'MORNING' }, { weekday: 'SATURDAY', timeOfDay: 'AFTERNOON' }], teach: [{ name: 'French', proficiency: 'EXPERT' }, { name: 'Arabic', proficiency: 'ADVANCED' }, { name: 'Spanish', proficiency: 'INTERMEDIATE' }], want: ['JavaScript', 'React', 'Data Analysis'] },
  { email: 'emma@example.com', displayName: 'Emma Thompson', university: 'Covenant University', department: 'Economics', yearLevel: '4th Year', bio: 'Data nerd and cooking enthusiast.', avatarUrl: 'https://i.pravatar.cc/300?img=44', learningFormat: 'EITHER', avail: [{ weekday: 'MONDAY', timeOfDay: 'EVENING' }, { weekday: 'WEDNESDAY', timeOfDay: 'EVENING' }, { weekday: 'SUNDAY', timeOfDay: 'AFTERNOON' }], teach: [{ name: 'Data Analysis', proficiency: 'ADVANCED' }, { name: 'Cooking', proficiency: 'EXPERT' }, { name: 'Statistics', proficiency: 'ADVANCED' }], want: ['React', 'JavaScript', 'Photography'] },
  { email: 'james@example.com', displayName: 'James Iroh', university: 'University of Nigeria, Nsukka', department: 'Music', yearLevel: '3rd Year', bio: 'Musician looking to learn design tools.', avatarUrl: 'https://i.pravatar.cc/300?img=15', learningFormat: 'EITHER', avail: [{ weekday: 'FRIDAY', timeOfDay: 'EVENING' }, { weekday: 'SATURDAY', timeOfDay: 'EVENING' }, { weekday: 'SUNDAY', timeOfDay: 'MORNING' }], teach: [{ name: 'Guitar', proficiency: 'EXPERT' }, { name: 'Music Production', proficiency: 'ADVANCED' }, { name: 'Singing', proficiency: 'INTERMEDIATE' }], want: ['Photoshop', 'Figma', 'Marketing'] },
  { email: 'zainab@example.com', displayName: 'Zainab Yusuf', university: 'Bayero University Kano', department: 'Business Administration', yearLevel: '4th Year', bio: 'Future entrepreneur. Want to sharpen my marketing skills.', avatarUrl: 'https://i.pravatar.cc/300?img=20', learningFormat: 'ONLINE', avail: [{ weekday: 'MONDAY', timeOfDay: 'MORNING' }, { weekday: 'WEDNESDAY', timeOfDay: 'MORNING' }, { weekday: 'FRIDAY', timeOfDay: 'AFTERNOON' }], teach: [{ name: 'Marketing', proficiency: 'ADVANCED' }, { name: 'Public Speaking', proficiency: 'EXPERT' }, { name: 'Entrepreneurship', proficiency: 'ADVANCED' }], want: ['Photography', 'Photoshop', 'Content Creation'] },
];

async function main() {
  console.log('🌱 Seeding SkillSwap…');

  // Non-destructive: skip entirely if already populated
  // (runs on every deploy via the build command, so it must never wipe data)
  const existing = await prisma.user.count();
  if (existing > 0) {
    console.log(`Database already has ${existing} users. Seed skipped.`);
    return;
  }

  console.log(`Creating ${SKILLS.length} skills…`);
  const skillMap = new Map();
  for (const skill of SKILLS) {
    const created = await prisma.skill.create({ data: skill });
    skillMap.set(skill.name, created.id);
  }

  console.log(`Creating ${USERS.length} users…`);
  const passwordHash = await bcrypt.hash('password123', 10);

  for (const user of USERS) {
    const created = await prisma.user.create({
      data: {
        email: user.email,
        passwordHash,
        displayName: user.displayName,
        isAdmin: user.isAdmin || false,
        profile: {
          create: {
            university: user.university,
            department: user.department,
            yearLevel: user.yearLevel,
            bio: user.bio,
            avatarUrl: user.avatarUrl,
            learningFormat: user.learningFormat,
            availabilities: { create: user.avail },
          },
        },
      },
    });

    for (const t of user.teach) {
      const skillId = skillMap.get(t.name);
      if (!skillId) continue;
      await prisma.userSkill.create({
        data: { userId: created.id, skillId, type: 'TEACH', proficiency: t.proficiency },
      });
    }
    for (const w of user.want) {
      const skillId = skillMap.get(w);
      if (!skillId) continue;
      await prisma.userSkill.create({
        data: { userId: created.id, skillId, type: 'WANT', proficiency: 'BEGINNER' },
      });
    }

    if (['sarah@example.com', 'fatima@example.com'].includes(user.email)) {
      await prisma.subscription.create({
        data: {
          userId: created.id,
          tier: 'PRO',
          status: 'ACTIVE',
          platform: 'WEB',
          productId: 'skillswap_pro_web_yearly',
          startedAt: new Date(),
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          autoRenew: false,
        },
      });
    }
  }

  console.log('✅ Seed complete!');
  console.log('📧 Test logins (password: password123):');
  USERS.forEach((u) => console.log('   ' + u.email));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());