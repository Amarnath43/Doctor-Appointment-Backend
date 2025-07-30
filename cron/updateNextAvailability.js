const cron = require('node-cron');
const Doctor = require('../models/doctorModel')
const getNextAvailableSlot = require('../utils/getNextAvailableSlot');

async function updateNextAvailabilityForAllDoctors() {
  try {
    const doctors = await Doctor.find();
    const now = new Date();

    for (const doctor of doctors) {
      doctor.availability = doctor.availability
        .map(entry => {
          const validSlots = entry.slots.filter(slot => {
            const slotTime = new Date(`${entry.date}T${slot}`);
            return slotTime > now;
          });
          return { ...entry, slots: validSlots };
        })
        .filter(entry => entry.slots.length > 0);

      doctor.availability.sort((a, b) => new Date(a.date) - new Date(b.date));
      const updatedNext = getNextAvailableSlot(doctor.availability);

      if (
        JSON.stringify(doctor.nextAvailability) !== JSON.stringify(updatedNext)
      ) {
        doctor.nextAvailability = updatedNext;
        await doctor.save();
        console.log(`[Updated] Doctor ${doctor._id} — ${updatedNext?.dateTime || 'No slots'}`);
      }
    }

    console.log(`[CRON] Finished at ${new Date().toISOString()}`);
  } catch (err) {
    console.error('[CRON ERROR]', err);
  }
}

// 👇 Run every 30 minutes
cron.schedule('*/30 * * * *', updateNextAvailabilityForAllDoctors);
