import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Create a system user to own default groups
  const systemPassword = await bcrypt.hash('system-internal', 12);
  const systemUser = await prisma.user.upsert({
    where: { email: 'system@lumina.app' },
    update: {},
    create: {
      email: 'system@lumina.app',
      password: systemPassword,
      displayName: 'Lumina',
      isAnonymous: false,
    },
  });

  // Seed default groups
  const defaultGroups = [
    { name: 'Daily Progress', description: 'Share your daily wins and growth moments.', icon: 'fas fa-chart-line', color: 'bg-blue-100 text-blue-600' },
    { name: 'Art Therapy', description: 'Express yourself through creativity and art.', icon: 'fas fa-palette', color: 'bg-purple-100 text-purple-600' },
    { name: 'Morning Walks', description: 'Connect with nature through daily walking.', icon: 'fas fa-walking', color: 'bg-green-100 text-green-600' },
    { name: 'Zen Moments', description: 'Find peace in mindfulness and meditation.', icon: 'fas fa-leaf', color: 'bg-teal-100 text-teal-600' },
  ];

  for (const group of defaultGroups) {
    await prisma.group.upsert({
      where: { id: group.name.toLowerCase().replace(/\s+/g, '-') },
      update: {},
      create: {
        id: group.name.toLowerCase().replace(/\s+/g, '-'),
        name: group.name,
        description: group.description,
        icon: group.icon,
        color: group.color,
        createdById: systemUser.id,
        isDefault: true,
      },
    });
  }

  console.log('Seed completed: default groups created');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
