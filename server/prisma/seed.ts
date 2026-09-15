import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SKILLS = [
  // Technology
  { name: 'Python', category: 'Technology', description: 'High-level programming language' },
  { name: 'JavaScript', category: 'Technology', description: 'Web programming language' },
  { name: 'TypeScript', category: 'Technology', description: 'Typed JavaScript' },
  { name: 'Java', category: 'Technology', description: 'Object-oriented programming language' },
  { name: 'C++', category: 'Technology', description: 'Systems programming language' },
  { name: 'React', category: 'Technology', description: 'Frontend JavaScript library' },
  { name: 'Node.js', category: 'Technology', description: 'JavaScript runtime' },
  { name: 'SQL', category: 'Technology', description: 'Database query language' },
  { name: 'Git', category: 'Technology', description: 'Version control' },
  { name: 'Cybersecurity', category: 'Technology', description: 'Security fundamentals' },
  { name: 'Data Analysis', category: 'Technology', description: 'Working with data' },
  { name: 'Machine Learning', category: 'Technology', description: 'AI/ML techniques' },
  // Design
  { name: 'Photoshop', category: 'Design', description: 'Image editing' },
  { name: 'Figma', category: 'Design', description: 'Interface design' },
  { name: 'Illustrator', category: 'Design', description: 'Vector graphics' },
  { name: 'Canva', category: 'Design', description: 'Simple design tool' },
  { name: 'UI Design', category: 'Design', description: 'User interface design' },
  { name: 'UX Design', category: 'Design', description: 'User experience design' },
  { name: 'Motion Design', category: 'Design', description: 'Animated graphics' },
  { name: 'Branding', category: 'Design', description: 'Brand identity design' },
  // Academic
  { name: 'Mathematics', category: 'Academic', description: 'Math tutoring' },
  { name: 'Physics', category: 'Academic', description: 'Physics tutoring' },
  { name: 'Statistics', category: 'Academic', description: 'Statistics help' },
  { name: 'Essay Writing', category: 'Academic', description: 'Academic writing' },
  { name: 'Research Methods', category: 'Academic', description: 'Research skills' },
  // Creative
  { name: 'Photography', category: 'Creative', description: 'Photography skills' },
  { name: 'Video Editing', category: 'Creative', description: 'Video post-production' },
  { name: 'Drawing', category: 'Creative', description: 'Drawing and illustration' },
  { name: 'Animation', category: 'Creative', description: '2D/3D animation' },
  { name: 'Creative Writing', category: 'Creative', description: 'Writing fiction and poetry' },
  { name: 'Content Creation', category: 'Creative', description: 'Online content' },
  // Business
  { name: 'Marketing', category: 'Business', description: 'Marketing strategy' },
  { name: 'Sales', category: 'Business', description: 'Sales techniques' },
  { name: 'Accounting', category: 'Business', description: 'Bookkeeping basics' },
  { name: 'Entrepreneurship', category: 'Business', description: 'Starting a business' },
  { name: 'Public Speaking', category: 'Business', description: 'Speaking with confidence' },
  // Languages
  { name: 'French', category: 'Languages', description: 'French language' },
  { name: 'Spanish', category: 'Languages', description: 'Spanish language' },
  { name: 'Mandarin', category: 'Languages', description: 'Chinese language' },
  { name: 'Arabic', category: 'Languages', description: 'Arabic language' },
  // Lifestyle
  { name: 'Cooking', category: 'Lifestyle', description: 'Home cooking' },
  { name: 'Fitness', category: 'Lifestyle', description: 'Workout coaching' },
  { name: 'Sewing', category: 'Lifestyle', description: 'Sewing & tailoring' },
  { name: 'Yoga', category: 'Lifestyle', description: 'Yoga practice' },
  // Music
  { name: 'Guitar', category: 'Music', description: 'Playing guitar' },
  { name: 'Piano', category: 'Music', description: 'Playing piano' },
  { name: 'Singing', category: 'Music', description: 'Vocal technique' },
  { name: 'Music Production', category: 'Music', description: 'Producing music' },
  // Communication
  { name: 'Negotiation', category: 'Communication', description: 'Negotiation skills' },
  { name: 'Storytelling', category: 'Communication', description: 'Storytelling craft' },
  { name: 'Networking', category: 'Communication', description: 'Professional networking' },
];

const USERS = [
  {
    email: 'alice@example.com',
    displayName: 'Alice Adebayo',
    university: 'University of Lagos',
    department: 'Computer Science',
    yearLevel: '3rd Year',
    bio: 'Backend developer who loves teaching programming fundamentals.',
    avatarUrl: 'https://i.pravatar.cc/300?img=47',
    learningFormat: 'EITHER' as const,
    avail: [
      { weekday: 'MONDAY' as const, timeOfDay: 'EVENING' as const },
      { weekday: 'WEDNESDAY' as const, timeOfDay: 'EVENING' as const },
      { weekday: 'SATURDAY' as const, timeOfDay: 'MORNING' as const },
    ],
    teach: [
      { name: 'Python', proficiency: 'ADVANCED' as const },
      { name: 'SQL', proficiency: 'ADVANCED' as const },
      { name: 'Git', proficiency: 'EXPERT' as const },
    ],
    want: ['Figma', 'UI Design', 'Photography'],
    isAdmin: true,
  },
  {
    email: 'bob@example.com',
    displayName: 'Bob Okeke',
    university: 'University of Lagos',
    department: 'Design',
    yearLevel: '4th Year',
    bio: 'Designer who wants to learn how to code.',
    avatarUrl: 'https://i.pravatar.cc/300?img=12',
    learningFormat: 'EITHER' as const,
    avail: [
      { weekday: 'TUESDAY' as const, timeOfDay: 'EVENING' as const },
      { weekday: 'THURSDAY' as const, timeOfDay: 'EVENING' as const },
      { weekday: 'SATURDAY' as const, timeOfDay: 'MORNING' as const },
    ],
    teach: [
      { name: 'Figma', proficiency: 'EXPERT' as const },
      { name: 'UI Design', proficiency: 'ADVANCED' as const },
      { name: 'Photography', proficiency: 'INTERMEDIATE' as const },
    ],
    want: ['Python', 'SQL', 'JavaScript'],
  },
  {
    email: 'sarah@example.com',
    displayName: 'Sarah Okafor',
    university: 'University of Ibadan',
    department: 'Mass Communication',
    yearLevel: '2nd Year',
    bio: 'Storyteller and content creator. Looking to improve my tech skills.',
    avatarUrl: 'https://i.pravatar.cc/300?img=49',
    learningFormat: 'ONLINE' as const,
    avail: [
      { weekday: 'MONDAY' as const, timeOfDay: 'AFTERNOON' as const },
      { weekday: 'WEDNESDAY' as const, timeOfDay: 'AFTERNOON' as const },
      { weekday: 'FRIDAY' as const, timeOfDay: 'MORNING' as const },
    ],
    teach: [
      { name: 'Creative Writing', proficiency: 'EXPERT' as const },
      { name: 'Content Creation', proficiency: 'ADVANCED' as const },
      { name: 'Public Speaking', proficiency: 'ADVANCED' as const },
    ],
    want: ['Photoshop', 'Video Editing', 'Photography'],
  },
  {
    email: 'david@example.com',
    displayName: 'David Mensah',
    university: 'University of Ibadan',
    department: 'Visual Arts',
    yearLevel: '3rd Year',
    bio: 'Photographer and editor. Want to learn to write better.',
    avatarUrl: 'https://i.pravatar.cc/300?img=33',
    learningFormat: 'IN_PERSON' as const,
    avail: [
      { weekday: 'MONDAY' as const, timeOfDay: 'AFTERNOON' as const },
      { weekday: 'WEDNESDAY' as const, timeOfDay: 'AFTERNOON' as const },
      { weekday: 'FRIDAY' as const, timeOfDay: 'MORNING' as const },
    ],
    teach: [
      { name: 'Photography', proficiency: 'EXPERT' as const },
      { name: 'Photoshop', proficiency: 'EXPERT' as const },
      { name: 'Video Editing', proficiency: 'ADVANCED' as const },
    ],
    want: ['Creative Writing', 'Public Speaking', 'French'],
  },
  {
    email: 'fatima@example.com',
    displayName: 'Fatima Bello',
    university: 'Ahmadu Bello University',
    department: 'Linguistics',
    yearLevel: '2nd Year',
    bio: 'Polyglot who loves teaching languages.',
    avatarUrl: 'https://i.pravatar.cc/300?img=45',
    learningFormat: 'ONLINE' as const,
    avail: [
      { weekday: 'TUESDAY' as const, timeOfDay: 'MORNING' as const },
      { weekday: 'THURSDAY' as const, timeOfDay: 'MORNING' as const },
      { weekday: 'SATURDAY' as const, timeOfDay: 'AFTERNOON' as const },
    ],
    teach: [
      { name: 'French', proficiency: 'EXPERT' as const },
      { name: 'Arabic', proficiency: 'ADVANCED' as const },
      { name: 'Spanish', proficiency: 'INTERMEDIATE' as const },
    ],
    want: ['JavaScript', 'React', 'Data Analysis'],
  },
  {
    email: 'emma@example.com',
    displayName: 'Emma Thompson',
    university: 'Covenant University',
    department: 'Economics',
    yearLevel: '4th Year',
    bio: 'Data nerd and cooking enthusiast.',
    avatarUrl: 'https://i.pravatar.cc/300?img=44',
    learningFormat: 'EITHER' as const,
    avail: [
      { weekday: 'MONDAY' as const, timeOfDay: 'EVENING' as const },
      { weekday: 'WEDNESDAY' as const, timeOfDay: 'EVENING' as const },
      { weekday: 'SUNDAY' as const, timeOfDay: 'AFTERNOON' as const },
    ],
    teach: [
      { name: 'Data Analysis', proficiency: 'ADVANCED' as const },
      { name: 'Cooking', proficiency: 'EXPERT' as const },
      { name: 'Statistics', proficiency: 'ADVANCED' as const },
    ],
    want: ['React', 'JavaScript', 'Photography'],
  },
  {
    email: 'james@example.com',
    displayName: 'James Iroh',
    university: 'University of Nigeria, Nsukka',
    department: 'Music',
    yearLevel: '3rd Year',
    bio: 'Musician looking to learn design tools.',
    avatarUrl: 'https://i.pravatar.cc/300?img=15',
    learningFormat: 'EITHER' as const,
    avail: [
      { weekday: 'FRIDAY' as const, timeOfDay: 'EVENING' as const },
      { weekday: 'SATURDAY' as const, timeOfDay: 'EVENING' as const },
      { weekday: 'SUNDAY' as const, timeOfDay: 'MORNING' as const },
    ],
    teach: [
      { name: 'Guitar', proficiency: 'EXPERT' as const },
      { name: 'Music Production', proficiency: 'ADVANCED' as const },
      { name: 'Singing', proficiency: 'INTERMEDIATE' as const },
    ],
    want: ['Photoshop', 'Figma', 'Marketing'],
  },
  {
    email: 'zainab@example.com',
    displayName: 'Zainab Yusuf',
    university: 'Bayero University Kano',
    department: 'Business Administration',
    yearLevel: '4th Year',
    bio: 'Future entrepreneur. Want to sharpen my marketing skills.',
    avatarUrl: 'https://i.pravatar.cc/300?img=20',
    learningFormat: 'ONLINE' as const,
    avail: [
      { weekday: 'MONDAY' as const, timeOfDay: 'MORNING' as const },
      { weekday: 'WEDNESDAY' as const, timeOfDay: 'MORNING' as const },
      { weekday: 'FRIDAY' as const, timeOfDay: 'AFTERNOON' as const },
    ],
    teach: [
      { name: 'Marketing', proficiency: 'ADVANCED' as const },
      { name: 'Public Speaking', proficiency: 'EXPERT' as const },
      { name: 'Entrepreneurship', proficiency: 'ADVANCED' as const },
    ],
    want: ['Photography', 'Photoshop', 'Content Creation'],
  },
];

async function main() {
  console.log('🌱 Seeding SkillSwap...');

  // Clear existing data
  await prisma.notification.deleteMany();
  await prisma.report.deleteMany();
  await prisma.block.deleteMany();
  await prisma.review.deleteMany();
  await prisma.message.deleteMany();
  await prisma.session.deleteMany();
  await prisma.exchangeCompletionConfirmation.deleteMany();
  await prisma.exchange.deleteMany();
  await prisma.exchangeRequest.deleteMany();
  await prisma.userSkill.deleteMany();
  await prisma.availability.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.skill.deleteMany();
  await prisma.user.deleteMany();

  // Seed skills
  console.log(`Creating ${SKILLS.length} skills...`);
  const skillMap = new Map<string, string>();
  for (const skill of SKILLS) {
    const created = await prisma.skill.create({ data: skill });
    skillMap.set(skill.name, created.id);
  }

  // Seed users
  console.log(`Creating ${USERS.length} users...`);
  const passwordHash = await bcrypt.hash('password123', 10);
  const userIds: string[] = [];

  for (const user of USERS) {
    const created = await prisma.user.create({
      data: {
        email: user.email,
        passwordHash,
        displayName: user.displayName,
        isAdmin: 'isAdmin' in user ? (user as any).isAdmin : false,
        profile: {
          create: {
            university: user.university,
            department: user.department,
            yearLevel: user.yearLevel,
            bio: user.bio,
            avatarUrl: user.avatarUrl,
            learningFormat: user.learningFormat,
            availabilities: {
              create: user.avail,
            },
          },
        },
      },
    });

    userIds.push(created.id);

    // Add teaching skills
    for (const t of user.teach) {
      const skillId = skillMap.get(t.name);
      if (!skillId) continue;
      await prisma.userSkill.create({
        data: {
          userId: created.id,
          skillId,
          type: 'TEACH',
          proficiency: t.proficiency,
        },
      });
    }

    // Add wanted skills
    for (const w of user.want) {
      const skillId = skillMap.get(w);
      if (!skillId) continue;
      await prisma.userSkill.create({
        data: {
          userId: created.id,
          skillId,
          type: 'WANT',
          proficiency: 'BEGINNER',
        },
      });
    }

    // Make a few users Pro to demonstrate the tier
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
  console.log('\n📧 Test logins (password: password123):');
  USERS.forEach((u) => console.log(`   ${u.email}`));
  console.log('\n💎 Pro users (Sarah, Fatima): can boost, see who viewed them, unlimited exchanges');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());