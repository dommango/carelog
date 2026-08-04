import { prisma } from '@carelog/db';

async function main() {
  const patient = await prisma.patient.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Evelyn Sample',
      medications: [
        { name: 'Albuterol', dose: '2.5 mg', route: 'nebulizer', timing: 'as needed / every 4h' },
      ],
    },
  });

  let admin = await prisma.user.findUnique({ where: { email: 'admin@carelog.local' } });
  if (!admin) {
    admin = await prisma.user.create({
      data: { email: 'admin@carelog.local', name: 'Admin User' },
    });
  }

  await prisma.caregiverAssignment.upsert({
    where: {
      userId_patientId: { userId: admin.id, patientId: patient.id },
    },
    update: {},
    create: { userId: admin.id, patientId: patient.id, role: 'admin' },
  });

  let caregiver = await prisma.user.findUnique({ where: { email: 'caregiver@carelog.local' } });
  if (!caregiver) {
    caregiver = await prisma.user.create({
      data: { email: 'caregiver@carelog.local', name: 'Caregiver User' },
    });
  }

  await prisma.caregiverAssignment.upsert({
    where: {
      userId_patientId: { userId: caregiver.id, patientId: patient.id },
    },
    update: {},
    create: { userId: caregiver.id, patientId: patient.id, role: 'caregiver' },
  });

  await prisma.template.upsert({
    where: { id: '00000000-0000-0000-0000-000000000101' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000101',
      patientId: patient.id,
      name: 'Morning nebulizer',
      category: 'nebulizer_treatment',
      defaults: { medication: 'Albuterol', dose: '2.5 mg', durationMinutes: 15 },
      createdBy: admin.id,
    },
  });

  await prisma.template.upsert({
    where: { id: '00000000-0000-0000-0000-000000000102' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000102',
      patientId: patient.id,
      name: 'Breakfast',
      category: 'meal',
      defaults: { items: [], notes: '' },
      createdBy: admin.id,
    },
  });

  await prisma.template.upsert({
    where: { id: '00000000-0000-0000-0000-000000000103' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000103',
      patientId: patient.id,
      name: 'Mood note',
      category: 'mood_behavior',
      defaults: { moodScore: 3, notes: '' },
      createdBy: admin.id,
    },
  });

  console.log('Seeded patient', patient.id, 'with admin', admin.id, 'and caregiver', caregiver.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
