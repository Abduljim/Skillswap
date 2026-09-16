// Run with: node scripts/seed-prod.js
// Used in production to seed the database once after first deploy.
// Uses compiled Prisma client only. No TypeScript, no tsx needed at runtime.

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// ---------- 220+ skills across 13 categories ----------
const SKILLS = [
  // Technology
  { name: 'Python', category: 'Technology', description: 'High-level language for scripts, web, and AI' },
  { name: 'JavaScript', category: 'Technology', description: 'Web programming language' },
  { name: 'TypeScript', category: 'Technology', description: 'Typed superset of JavaScript' },
  { name: 'Java', category: 'Technology', description: 'Object-oriented language for enterprise and Android' },
  { name: 'C++', category: 'Technology', description: 'High-performance systems programming' },
  { name: 'C#', category: 'Technology', description: 'Microsoft ecosystem and game dev with Unity' },
  { name: 'C', category: 'Technology', description: 'Low-level systems and embedded programming' },
  { name: 'Go', category: 'Technology', description: 'Fast, simple language by Google for backend services' },
  { name: 'Rust', category: 'Technology', description: 'Memory-safe systems programming' },
  { name: 'Kotlin', category: 'Technology', description: 'Modern language for Android development' },
  { name: 'Swift', category: 'Technology', description: 'Apple platform development (iOS, macOS)' },
  { name: 'Ruby', category: 'Technology', description: 'Developer-friendly language, popular for Rails' },
  { name: 'PHP', category: 'Technology', description: 'Server-side scripting, powers WordPress' },
  { name: 'R', category: 'Technology', description: 'Statistical computing and graphics' },
  { name: 'Scala', category: 'Technology', description: 'Functional/object hybrid on the JVM' },
  { name: 'Dart', category: 'Technology', description: 'Client-optimized language for Flutter apps' },
  { name: 'SQL', category: 'Technology', description: 'Database query language' },
  { name: 'NoSQL', category: 'Technology', description: 'Document and key-value databases' },
  { name: 'GraphQL', category: 'Technology', description: 'API query language alternative to REST' },
  { name: 'React', category: 'Technology', description: 'Component-based UI library by Meta' },
  { name: 'Vue.js', category: 'Technology', description: 'Progressive JavaScript framework' },
  { name: 'Angular', category: 'Technology', description: 'Full-featured TypeScript framework by Google' },
  { name: 'Svelte', category: 'Technology', description: 'Compiled framework with minimal boilerplate' },
  { name: 'Next.js', category: 'Technology', description: 'React framework with SSR and routing' },
  { name: 'Nuxt', category: 'Technology', description: 'Vue framework with SSR and routing' },
  { name: 'Remix', category: 'Technology', description: 'Full-stack React framework focused on web standards' },
  { name: 'Astro', category: 'Technology', description: 'Content-focused framework with islands architecture' },
  { name: 'Solid.js', category: 'Technology', description: 'Fine-grained reactive UI library' },
  { name: 'HTMX', category: 'Technology', description: 'HTML over the wire, minimal JS' },
  { name: 'Tailwind CSS', category: 'Technology', description: 'Utility-first CSS framework' },
  { name: 'Node.js', category: 'Technology', description: 'JavaScript runtime for servers' },
  { name: 'Express.js', category: 'Technology', description: 'Minimal Node.js web framework' },
  { name: 'NestJS', category: 'Technology', description: 'Structured Node.js framework with TypeScript' },
  { name: 'Django', category: 'Technology', description: 'Batteries-included Python web framework' },
  { name: 'Flask', category: 'Technology', description: 'Lightweight Python web framework' },
  { name: 'FastAPI', category: 'Technology', description: 'Modern, fast Python API framework' },
  { name: 'Spring Boot', category: 'Technology', description: 'Java framework for production services' },
  { name: 'Laravel', category: 'Technology', description: 'PHP framework with elegant syntax' },
  { name: 'Rails', category: 'Technology', description: 'Ruby framework with convention over configuration' },
  { name: 'ASP.NET', category: 'Technology', description: 'Microsoft web framework' },
  { name: 'PostgreSQL', category: 'Technology', description: 'Open-source relational database' },
  { name: 'MongoDB', category: 'Technology', description: 'Document-oriented NoSQL database' },
  { name: 'Redis', category: 'Technology', description: 'In-memory data store and cache' },
  { name: 'Flutter', category: 'Technology', description: 'Cross-platform mobile UI toolkit' },
  { name: 'React Native', category: 'Technology', description: 'Build native mobile apps with React' },
  { name: 'iOS Development', category: 'Technology', description: 'Build apps for iPhone and iPad' },
  { name: 'Android Development', category: 'Technology', description: 'Build apps for Android devices' },
  { name: 'SwiftUI', category: 'Technology', description: 'Declarative UI framework for Apple platforms' },
  { name: 'Docker', category: 'Technology', description: 'Container platform for shipping apps' },
  { name: 'Kubernetes', category: 'Technology', description: 'Container orchestration at scale' },
  { name: 'AWS', category: 'Technology', description: 'Amazon Web Services cloud platform' },
  { name: 'Google Cloud', category: 'Technology', description: 'GCP services and infrastructure' },
  { name: 'Azure', category: 'Technology', description: 'Microsoft cloud platform' },
  { name: 'Terraform', category: 'Technology', description: 'Infrastructure as code' },
  { name: 'CI/CD', category: 'Technology', description: 'Continuous integration and deployment pipelines' },
  { name: 'Linux', category: 'Technology', description: 'Open-source operating system' },
  { name: 'Git', category: 'Technology', description: 'Version control everyone uses' },
  { name: 'Cybersecurity', category: 'Technology', description: 'Security fundamentals and best practices' },
  { name: 'Data Analysis', category: 'Technology', description: 'Working with data to find insights' },
  { name: 'Machine Learning', category: 'Technology', description: 'Building models that learn from data' },
  { name: 'Deep Learning', category: 'Technology', description: 'Neural networks for vision, text, and audio' },
  { name: 'Data Science', category: 'Technology', description: 'Statistics, modeling, and storytelling with data' },
  { name: 'NLP', category: 'Technology', description: 'Natural language processing techniques' },
  { name: 'Computer Vision', category: 'Technology', description: 'Teaching machines to see' },
  { name: 'Prompt Engineering', category: 'Technology', description: 'Working effectively with AI assistants' },
  { name: 'TensorFlow', category: 'Technology', description: 'Open-source ML framework by Google' },
  { name: 'PyTorch', category: 'Technology', description: 'Python ML framework popular in research' },
  { name: 'Pandas', category: 'Technology', description: 'Python library for data wrangling' },
  { name: 'Power BI', category: 'Technology', description: 'Business intelligence and dashboards' },
  { name: 'Tableau', category: 'Technology', description: 'Visual analytics and dashboards' },
  { name: 'Web Development', category: 'Technology', description: 'Building websites and web apps' },

  // Design
  { name: 'Photoshop', category: 'Design', description: 'Industry-standard image editing' },
  { name: 'Figma', category: 'Design', description: 'Collaborative interface design tool' },
  { name: 'Illustrator', category: 'Design', description: 'Vector graphics and illustration' },
  { name: 'Canva', category: 'Design', description: 'Simple design tool for non-designers' },
  { name: 'UI Design', category: 'Design', description: 'Crafting interfaces that feel good' },
  { name: 'UX Design', category: 'Design', description: 'Designing the full experience around a product' },
  { name: 'UX Research', category: 'Design', description: 'User interviews, testing, and validation' },
  { name: 'Motion Design', category: 'Design', description: 'Animated graphics and micro-interactions' },
  { name: 'Branding', category: 'Design', description: 'Building a recognizable brand identity' },
  { name: 'Logo Design', category: 'Design', description: 'Designing memorable logos' },
  { name: 'Typography', category: 'Design', description: 'Choosing and pairing typefaces' },
  { name: 'Color Theory', category: 'Design', description: 'Using color to communicate and guide' },
  { name: 'Sketch', category: 'Design', description: 'Mac-only UI design tool' },
  { name: 'Adobe XD', category: 'Design', description: 'UX prototyping by Adobe' },
  { name: 'After Effects', category: 'Design', description: 'Motion graphics and visual effects' },
  { name: 'Premiere Pro', category: 'Design', description: 'Video editing by Adobe' },
  { name: 'Final Cut Pro', category: 'Design', description: 'Video editing on macOS' },
  { name: 'DaVinci Resolve', category: 'Design', description: 'Color grading and video editing' },
  { name: 'Blender', category: 'Design', description: 'Free 3D modeling and animation' },
  { name: 'Procreate', category: 'Design', description: 'iPad illustration app' },

  // Academic
  { name: 'Mathematics', category: 'Academic', description: 'From arithmetic to calculus' },
  { name: 'Algebra', category: 'Academic', description: 'Equations, polynomials, and functions' },
  { name: 'Geometry', category: 'Academic', description: 'Shapes, proofs, and spatial reasoning' },
  { name: 'Calculus', category: 'Academic', description: 'Derivatives, integrals, and limits' },
  { name: 'Linear Algebra', category: 'Academic', description: 'Vectors, matrices, and transformations' },
  { name: 'Discrete Math', category: 'Academic', description: 'Logic, sets, and combinatorics' },
  { name: 'Physics', category: 'Academic', description: 'Mechanics, electromagnetism, and beyond' },
  { name: 'Chemistry', category: 'Academic', description: 'Atoms, molecules, and reactions' },
  { name: 'Biology', category: 'Academic', description: 'Cells, organisms, and ecosystems' },
  { name: 'Statistics', category: 'Academic', description: 'Probability and inference' },
  { name: 'Economics', category: 'Academic', description: 'Micro and macro foundations' },
  { name: 'Psychology 101', category: 'Academic', description: 'Intro to how people think and behave' },
  { name: 'Essay Writing', category: 'Academic', description: 'Academic writing and structure' },
  { name: 'Research Methods', category: 'Academic', description: 'Designing and running studies' },
  { name: 'Test Prep (SAT)', category: 'Academic', description: 'SAT strategy and practice' },
  { name: 'Test Prep (GRE)', category: 'Academic', description: 'GRE quantitative and verbal' },
  { name: 'Test Prep (GMAT)', category: 'Academic', description: 'GMAT prep for business school' },
  { name: 'IELTS', category: 'Academic', description: 'English proficiency test prep' },
  { name: 'TOEFL', category: 'Academic', description: 'English test for study abroad' },

  // Creative
  { name: 'Photography', category: 'Creative', description: 'Composition, lighting, and editing' },
  { name: 'Portrait Photography', category: 'Creative', description: 'Studio and natural light portraits' },
  { name: 'Street Photography', category: 'Creative', description: 'Candid urban moments' },
  { name: 'Photo Editing', category: 'Creative', description: 'Lightroom, Capture One, and Photoshop' },
  { name: 'Video Editing', category: 'Creative', description: 'Cutting and polishing video' },
  { name: 'Drawing', category: 'Creative', description: 'Pencil, ink, and charcoal fundamentals' },
  { name: 'Painting', category: 'Creative', description: 'Acrylic, oil, and watercolor' },
  { name: 'Watercolor', category: 'Creative', description: 'Loose, transparent painting' },
  { name: 'Animation', category: 'Creative', description: '2D and 3D animation' },
  { name: 'Creative Writing', category: 'Creative', description: 'Fiction, poetry, and memoir' },
  { name: 'Screenwriting', category: 'Creative', description: 'Writing for film and TV' },
  { name: 'Poetry', category: 'Creative', description: 'Form, rhythm, and voice' },
  { name: 'Journalism', category: 'Creative', description: 'Reporting and feature writing' },
  { name: 'Podcasting', category: 'Creative', description: 'Recording, editing, and publishing podcasts' },
  { name: 'YouTube Creation', category: 'Creative', description: 'Planning, filming, and growing a channel' },
  { name: 'Content Creation', category: 'Creative', description: 'Building an audience online' },
  { name: 'Knitting', category: 'Creative', description: 'Scarves, hats, and sweaters' },
  { name: 'Crochet', category: 'Creative', description: 'Amigurumi and wearables' },
  { name: 'Pottery', category: 'Creative', description: 'Hand-building and wheel throwing' },
  { name: 'Woodworking', category: 'Creative', description: 'Furniture and small projects' },

  // Business
  { name: 'Marketing', category: 'Business', description: 'Strategy, channels, and funnels' },
  { name: 'Digital Marketing', category: 'Business', description: 'SEO, ads, and social' },
  { name: 'SEO', category: 'Business', description: 'Search engine optimization' },
  { name: 'Email Marketing', category: 'Business', description: 'Lists, automations, and deliverability' },
  { name: 'Social Media Marketing', category: 'Business', description: 'Instagram, TikTok, LinkedIn growth' },
  { name: 'Sales', category: 'Business', description: 'Discovery, objections, and closing' },
  { name: 'B2B Sales', category: 'Business', description: 'Selling to businesses' },
  { name: 'Customer Success', category: 'Business', description: 'Onboarding and retention' },
  { name: 'Product Management', category: 'Business', description: 'Roadmaps, prioritization, and launches' },
  { name: 'Project Management', category: 'Business', description: 'Agile, Scrum, and Kanban' },
  { name: 'Accounting', category: 'Business', description: 'Bookkeeping and basic finance' },
  { name: 'Bookkeeping', category: 'Business', description: 'Day-to-day financial records' },
  { name: 'Personal Finance', category: 'Business', description: 'Budgeting, saving, and investing basics' },
  { name: 'Investing', category: 'Business', description: 'Stocks, ETFs, and portfolio building' },
  { name: 'Entrepreneurship', category: 'Business', description: 'Starting and growing a business' },
  { name: 'Fundraising', category: 'Business', description: 'Pitching angels and VCs' },
  { name: 'Leadership', category: 'Business', description: 'Managing teams and influence' },
  { name: 'Public Speaking', category: 'Business', description: 'Speaking with confidence' },
  { name: 'Conflict Resolution', category: 'Business', description: 'Mediating disputes productively' },

  // Languages
  { name: 'French', category: 'Languages', description: 'French language' },
  { name: 'Spanish', category: 'Languages', description: 'Spanish language' },
  { name: 'Mandarin', category: 'Languages', description: 'Chinese (Mandarin) language' },
  { name: 'Cantonese', category: 'Languages', description: 'Chinese (Cantonese) language' },
  { name: 'Arabic', category: 'Languages', description: 'Modern Standard Arabic' },
  { name: 'Portuguese', category: 'Languages', description: 'Brazilian and European Portuguese' },
  { name: 'German', category: 'Languages', description: 'German language' },
  { name: 'Italian', category: 'Languages', description: 'Italian language' },
  { name: 'Japanese', category: 'Languages', description: 'Japanese language' },
  { name: 'Korean', category: 'Languages', description: 'Korean language' },
  { name: 'Russian', category: 'Languages', description: 'Russian language' },
  { name: 'Hindi', category: 'Languages', description: 'Hindi language' },
  { name: 'Yoruba', category: 'Languages', description: 'Yoruba language' },
  { name: 'Swahili', category: 'Languages', description: 'Swahili language' },
  { name: 'Igbo', category: 'Languages', description: 'Igbo language' },
  { name: 'Hausa', category: 'Languages', description: 'Hausa language' },
  { name: 'American Sign Language', category: 'Languages', description: 'ASL for the Deaf community' },
  { name: 'English as a Second Language', category: 'Languages', description: 'ESL conversation and writing' },

  // Lifestyle
  { name: 'Cooking', category: 'Lifestyle', description: 'Home cooking from weeknight to weekend' },
  { name: 'Baking', category: 'Lifestyle', description: 'Bread, pastry, and cakes' },
  { name: 'Vegan Cooking', category: 'Lifestyle', description: 'Plant-based meals' },
  { name: 'BBQ and Grilling', category: 'Lifestyle', description: 'Low-and-slow and hot-and-fast' },
  { name: 'Coffee', category: 'Lifestyle', description: 'Espresso, pour-over, and roasting' },
  { name: 'Wine', category: 'Lifestyle', description: 'Tasting, regions, and food pairing' },
  { name: 'Fitness', category: 'Lifestyle', description: 'Workout programming and coaching' },
  { name: 'Strength Training', category: 'Lifestyle', description: 'Barbells, dumbbells, and progressive overload' },
  { name: 'Running', category: 'Lifestyle', description: 'Couch to 5K through marathon' },
  { name: 'Cycling', category: 'Lifestyle', description: 'Road, gravel, and bike maintenance' },
  { name: 'Swimming', category: 'Lifestyle', description: 'Technique and endurance' },
  { name: 'Meditation', category: 'Lifestyle', description: 'Mindfulness and breathwork' },
  { name: 'Yoga', category: 'Lifestyle', description: 'Hatha, Vinyasa, and Yin' },
  { name: 'Pilates', category: 'Lifestyle', description: 'Core strength and flexibility' },
  { name: 'Sewing', category: 'Lifestyle', description: 'Sewing and tailoring clothes' },
  { name: 'Gardening', category: 'Lifestyle', description: 'Vegetables, herbs, and flowers' },
  { name: 'Beekeeping', category: 'Lifestyle', description: 'Hives, honey, and pollination' },
  { name: 'Home Repair', category: 'Lifestyle', description: 'Plumbing, electrical, and drywall basics' },
  { name: 'Auto Mechanics', category: 'Lifestyle', description: 'Car maintenance and repair' },
  { name: 'Pet Training', category: 'Lifestyle', description: 'Dogs, cats, and basic obedience' },

  // Music
  { name: 'Guitar', category: 'Music', description: 'Acoustic and electric guitar' },
  { name: 'Bass Guitar', category: 'Music', description: 'Playing bass in a band' },
  { name: 'Piano', category: 'Music', description: 'Classical and contemporary piano' },
  { name: 'Drums', category: 'Music', description: 'Drum kit fundamentals' },
  { name: 'Singing', category: 'Music', description: 'Vocal technique and performance' },
  { name: 'Music Theory', category: 'Music', description: 'Chords, scales, and harmony' },
  { name: 'Song Structure', category: 'Music', description: 'Verses, choruses, and bridges' },
  { name: 'Music Production', category: 'Music', description: 'DAWs, mixing, and mastering' },
  { name: 'Ableton Live', category: 'Music', description: 'Live performance and production' },
  { name: 'Logic Pro', category: 'Music', description: 'Apple pro DAW' },
  { name: 'FL Studio', category: 'Music', description: 'Beat making and production' },
  { name: 'DJing', category: 'Music', description: 'Mixing, transitions, and crates' },

  // Communication
  { name: 'Negotiation', category: 'Communication', description: 'Win-win negotiation tactics' },
  { name: 'Storytelling', category: 'Communication', description: 'Crafting stories that land' },
  { name: 'Networking', category: 'Communication', description: 'Building professional relationships' },
  { name: 'Active Listening', category: 'Communication', description: 'Hearing what people really mean' },
  { name: 'Persuasive Writing', category: 'Communication', description: 'Writing that moves people to act' },
  { name: 'Presentation Skills', category: 'Communication', description: 'Slide design and delivery' },
  { name: 'Interview Prep', category: 'Communication', description: 'Behavioral and technical interviews' },
  { name: 'Dating and Relationships', category: 'Communication', description: 'Communication and boundaries' },

  // Health
  { name: 'Nutrition', category: 'Health', description: 'Macros, micros, and meal planning' },
  { name: 'Mental Health Basics', category: 'Health', description: 'Stress, anxiety, and coping tools' },
  { name: 'Sleep Hygiene', category: 'Health', description: 'Habits for better rest' },
  { name: 'Stretching', category: 'Health', description: 'Flexibility and recovery' },
  { name: 'Posture Correction', category: 'Health', description: 'Sitting and standing better' },
  { name: 'First Aid', category: 'Health', description: 'CPR, choking, and basic emergencies' },

  // Trades
  { name: 'Welding', category: 'Trades', description: 'MIG, TIG, and stick basics' },
  { name: 'Plumbing', category: 'Trades', description: 'Faucets, drains, and toilets' },
  { name: 'Electrical Wiring', category: 'Trades', description: 'Safe home wiring basics' },
  { name: 'Carpentry', category: 'Trades', description: 'Framing, trim, and furniture' },
  { name: '3D Printing', category: 'Trades', description: 'Slicing, materials, and design' },

  // Games
  { name: 'Chess', category: 'Games', description: 'Openings, tactics, and endgames' },
  { name: 'Go (Board Game)', category: 'Games', description: 'Ancient strategy board game' },
  { name: 'Poker', category: 'Games', description: 'Tournament strategy and reads' },
  { name: 'Speedcubing (Rubik\'s)', category: 'Games', description: 'CFOP method and finger tricks' },
  { name: 'Video Game Coaching', category: 'Games', description: 'Aim, strategy, and rank-up help' },
];

const USERS = [
  { email: 'alice@example.com', displayName: 'Alice Adebayo', university: 'University of Lagos', department: 'Computer Science', yearLevel: '3rd Year', bio: 'CS senior. Love teaching Python and SQL. Looking to learn photography and cooking.', avatarUrl: 'https://i.pravatar.cc/300?img=47', learningFormat: 'EITHER', avail: [{ weekday: 'MONDAY', timeOfDay: 'EVENING' }, { weekday: 'WEDNESDAY', timeOfDay: 'EVENING' }, { weekday: 'SATURDAY', timeOfDay: 'MORNING' }], teach: [{ name: 'Python', proficiency: 'ADVANCED' }, { name: 'SQL', proficiency: 'ADVANCED' }, { name: 'Git', proficiency: 'EXPERT' }, { name: 'Data Analysis', proficiency: 'INTERMEDIATE' }, { name: 'Public Speaking', proficiency: 'ADVANCED' }], want: ['Photography', 'Cooking', 'Yoga', 'UI Design', 'Spanish'], isAdmin: true },
  { email: 'bob@example.com', displayName: 'Bob Okeke', university: 'University of Lagos', department: 'Design', yearLevel: '4th Year', bio: 'Product designer by day, musician by night. Can teach Figma and guitar.', avatarUrl: 'https://i.pravatar.cc/300?img=12', learningFormat: 'EITHER', avail: [{ weekday: 'TUESDAY', timeOfDay: 'EVENING' }, { weekday: 'THURSDAY', timeOfDay: 'EVENING' }, { weekday: 'SATURDAY', timeOfDay: 'MORNING' }], teach: [{ name: 'Figma', proficiency: 'EXPERT' }, { name: 'UI Design', proficiency: 'ADVANCED' }, { name: 'Photography', proficiency: 'INTERMEDIATE' }, { name: 'Guitar', proficiency: 'ADVANCED' }, { name: 'Branding', proficiency: 'INTERMEDIATE' }], want: ['Python', 'SQL', 'Machine Learning', 'Data Analysis'] },
  { email: 'sarah@example.com', displayName: 'Sarah Kim', university: 'Yale University', department: 'Linguistics', yearLevel: '2nd Year', bio: 'Linguistics major, polyglot. I teach French and Spanish, want to learn guitar and cooking.', avatarUrl: 'https://i.pravatar.cc/300?img=49', learningFormat: 'ONLINE', avail: [{ weekday: 'MONDAY', timeOfDay: 'AFTERNOON' }, { weekday: 'WEDNESDAY', timeOfDay: 'AFTERNOON' }, { weekday: 'FRIDAY', timeOfDay: 'MORNING' }], teach: [{ name: 'French', proficiency: 'EXPERT' }, { name: 'Spanish', proficiency: 'ADVANCED' }, { name: 'Creative Writing', proficiency: 'ADVANCED' }, { name: 'English as a Second Language', proficiency: 'EXPERT' }, { name: 'Storytelling', proficiency: 'ADVANCED' }], want: ['Guitar', 'Cooking', 'Yoga', 'Photography'], isPro: true },
  { email: 'david@example.com', displayName: 'David Mensah', university: 'University of Cape Coast', department: 'Visual Arts', yearLevel: '3rd Year', bio: 'Pro photographer. Swap with me for code or business help.', avatarUrl: 'https://i.pravatar.cc/300?img=33', learningFormat: 'IN_PERSON', avail: [{ weekday: 'MONDAY', timeOfDay: 'AFTERNOON' }, { weekday: 'WEDNESDAY', timeOfDay: 'AFTERNOON' }, { weekday: 'FRIDAY', timeOfDay: 'MORNING' }], teach: [{ name: 'Photography', proficiency: 'EXPERT' }, { name: 'Portrait Photography', proficiency: 'ADVANCED' }, { name: 'Photo Editing', proficiency: 'ADVANCED' }, { name: 'Storytelling', proficiency: 'INTERMEDIATE' }], want: ['JavaScript', 'React', 'SEO', 'Marketing'] },
  { email: 'fatima@example.com', displayName: 'Fatima Hassan', university: 'University of Edinburgh', department: 'Marketing', yearLevel: '4th Year', bio: 'Marketing strategist and yoga teacher.', avatarUrl: 'https://i.pravatar.cc/300?img=45', learningFormat: 'ONLINE', avail: [{ weekday: 'TUESDAY', timeOfDay: 'MORNING' }, { weekday: 'THURSDAY', timeOfDay: 'MORNING' }, { weekday: 'SATURDAY', timeOfDay: 'AFTERNOON' }], teach: [{ name: 'Marketing', proficiency: 'EXPERT' }, { name: 'SEO', proficiency: 'ADVANCED' }, { name: 'Yoga', proficiency: 'EXPERT' }, { name: 'Meditation', proficiency: 'ADVANCED' }, { name: 'Social Media Marketing', proficiency: 'ADVANCED' }], want: ['Arabic', 'Cooking', 'Web Development', 'Data Analysis'], isPro: true },
  { email: 'emma@example.com', displayName: 'Emma Larsson', university: 'KTH Royal Institute of Technology', department: 'Computer Science', yearLevel: '4th Year', bio: 'ML engineer. Teach data science, want to learn music production.', avatarUrl: 'https://i.pravatar.cc/300?img=44', learningFormat: 'EITHER', avail: [{ weekday: 'MONDAY', timeOfDay: 'EVENING' }, { weekday: 'WEDNESDAY', timeOfDay: 'EVENING' }, { weekday: 'SUNDAY', timeOfDay: 'AFTERNOON' }], teach: [{ name: 'Machine Learning', proficiency: 'EXPERT' }, { name: 'Python', proficiency: 'ADVANCED' }, { name: 'Data Science', proficiency: 'ADVANCED' }, { name: 'Deep Learning', proficiency: 'ADVANCED' }], want: ['Music Production', 'Piano', 'DJing', 'Cooking'] },
  { email: 'james@example.com', displayName: 'James Wright', university: 'Stanford University', department: 'Business Administration', yearLevel: '4th Year', bio: 'Career changer. Teach business and sales, want to learn coding.', avatarUrl: 'https://i.pravatar.cc/300?img=15', learningFormat: 'EITHER', avail: [{ weekday: 'FRIDAY', timeOfDay: 'EVENING' }, { weekday: 'SATURDAY', timeOfDay: 'EVENING' }, { weekday: 'SUNDAY', timeOfDay: 'MORNING' }], teach: [{ name: 'Sales', proficiency: 'EXPERT' }, { name: 'Public Speaking', proficiency: 'ADVANCED' }, { name: 'Negotiation', proficiency: 'ADVANCED' }, { name: 'Entrepreneurship', proficiency: 'ADVANCED' }, { name: 'Interview Prep', proficiency: 'ADVANCED' }], want: ['JavaScript', 'Python', 'Web Development', 'Photography'] },
  { email: 'zainab@example.com', displayName: 'Zainab Okafor', university: 'University of Ibadan', department: 'Medicine', yearLevel: '3rd Year', bio: 'Med student. Teach biology and chemistry, want to learn design.', avatarUrl: 'https://i.pravatar.cc/300?img=20', learningFormat: 'ONLINE', avail: [{ weekday: 'MONDAY', timeOfDay: 'MORNING' }, { weekday: 'WEDNESDAY', timeOfDay: 'MORNING' }, { weekday: 'FRIDAY', timeOfDay: 'AFTERNOON' }], teach: [{ name: 'Biology', proficiency: 'EXPERT' }, { name: 'Chemistry', proficiency: 'ADVANCED' }, { name: 'Statistics', proficiency: 'ADVANCED' }, { name: 'Research Methods', proficiency: 'INTERMEDIATE' }], want: ['UI Design', 'Photoshop', 'Figma', 'Content Creation'] },
];

async function main() {
  console.log('🌱 Seeding SkillSwap…');

  const skillCount = await prisma.skill.count();
  const userCount = await prisma.user.count();

  console.log(`Refreshing/adding ${SKILLS.length} skills…`);
  const skillMap = new Map();
  for (const skill of SKILLS) {
    const created = await prisma.skill.upsert({
      where: { name: skill.name },
      update: { category: skill.category, description: skill.description || null, isActive: true },
      create: { name: skill.name, category: skill.category, description: skill.description || null, isActive: true },
    });
    skillMap.set(skill.name, created.id);
  }
  if (skillCount > 0) {
    console.log(`Skills: ${skillCount} → ${await prisma.skill.count()} (missing ones added).`);
  } else {
    console.log(`Created ${SKILLS.length} skills.`);
  }

  // Non-destructive: if the DB already has users, never touch them.
  // This lets the seed run safely on every deploy (build command) — it only
  // adds new skills/metadata, it never wipes accounts, profiles, or data.
  if (userCount > 0) {
    console.log(`Database already has ${userCount} users — skipping user seed (data preserved).`);
    console.log('✅ Seed complete!');
    console.log(`📊 ${await prisma.skill.count()} skills total.`);
    return;
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

    if (user.isPro) {
      await prisma.subscription.create({
        data: {
          userId: created.id,
          tier: 'PRO',
          status: 'ACTIVE',
          platform: 'WEB',
          productId: 'skillswap_pro_web_yearly',
          startedAt: new Date(),
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          autoRenew: true,
        },
      });
    }
  }

  console.log('✅ Seed complete!');
  console.log(`📊 ${SKILLS.length} skills across ${new Set(SKILLS.map((s) => s.category)).size} categories`);
  console.log('📧 Test logins (password: password123):');
  USERS.forEach((u) => console.log('   ' + u.email + (u.isPro ? ' (Pro)' : '') + (u.isAdmin ? ' (admin)' : '')));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());