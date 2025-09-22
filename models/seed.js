const mongoose = require('mongoose');
const Reception = require('./Reception.js');

const scanTypes = ['MRI', 'CT', 'X-Ray', 'Ultrasound', 'PET'];
const severities = ['Low', 'Medium', 'High', 'Critical'];
const statuses = ['Pending', 'Reviewing', 'Complete'];

const patientNames = Array.from({ length: 10 }, (_, i) => `Patient${i + 1}`);
const doctors = Array.from({ length: 5 }, (_, i) => `Doctor${i + 1}`);

const getRandomDate = () => {
  const start = new Date();
  start.setFullYear(start.getFullYear() - 1);
  const end = new Date();
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
};

const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const getRandomElement = (array) => array[Math.floor(Math.random() * array.length)];

async function seedData() {
  try {
    await mongoose.connect('mongodb+srv://blaah:blaah123@cluster0.8f8e2kg.mongodb.net/healthchain', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB');

    await Reception.deleteMany({});
    console.log('Cleared existing data');

    const trainingQueue = [];
    const patientStatusBoard = [];
    const numRecords = 6; // Changed to 6 records

    for (let i = 0; i < numRecords; i++) {
      // Randomly decide if the patient is booked (70% chance of being assigned a doctor)
      const isBooked = Math.random() < 0.7;
      trainingQueue.push({
        patientName: getRandomElement(patientNames),
        type: getRandomElement(scanTypes),
        cvfScore: getRandomInt(0, 100),
        date: getRandomDate(),
        assignedTo: isBooked ? getRandomElement(doctors) : "",
        severity: getRandomElement(severities)
      });
    }

    for (let i = 0; i < numRecords; i++) {
      patientStatusBoard.push({
        patientName: getRandomElement(patientNames),
        type: getRandomElement(scanTypes),
        date: getRandomDate(),
        status: getRandomElement(statuses)
      });
    }

    await Reception.create({
      trainingQueue,
      patientStatusBoard
    });

    console.log('Data seeded successfully');
  } catch (error) {
    console.error('Error seeding data:', error);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

seedData();