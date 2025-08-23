const cron = require('node-cron');
const Doctor = require('../models/doctorModel');
const getNextAvailableSlot = require('../utils/getNextAvailableSlot');
const mergeSlotToDateArray = require('../utils/mergeSlotToDateArray');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

const cleanExpiredSlots = async () => {
  try {
    const now = dayjs().tz('Asia/Kolkata'); // current time in IST
    const todayStr = now.format('YYYY-MM-DD'); // e.g., '2025-08-05'

    const doctors = await Doctor.find();

    for (const doctor of doctors) {
      const todayEntry = doctor.availability.find(entry => {
        const entryDateIST = dayjs(entry.date).tz('Asia/Kolkata').format('YYYY-MM-DD');
        return entryDateIST === todayStr;
      });

      if (!todayEntry) continue;

      const futureSlots = todayEntry.slots.filter(slot =>
        dayjs.tz(`${todayStr} ${slot}`, 'YYYY-MM-DD HH:mm', 'Asia/Kolkata').isAfter(now)
      );

      const expiredSlots = todayEntry.slots.filter(slot =>
        !dayjs.tz(`${todayStr} ${slot}`, 'YYYY-MM-DD HH:mm', 'Asia/Kolkata').isAfter(now)
      );

      // Move expired slots into pastAvailability
      expiredSlots.forEach(slot => {
        mergeSlotToDateArray(doctor.pastAvailability, todayStr, slot);
      });

      // Update availability
      if (futureSlots.length > 0) {
        todayEntry.slots = futureSlots;
      } else {
        doctor.availability = doctor.availability.filter(entry => {
          const entryDateIST = dayjs(entry.date).tz('Asia/Kolkata').format('YYYY-MM-DD');
          return entryDateIST !== todayStr;
        });
      }

      doctor.availability = doctor.availability.filter(e => e.slots.length > 0);
      doctor.availability.sort((a, b) => new Date(a.date) - new Date(b.date));
      doctor.nextAvailability = getNextAvailableSlot(doctor.availability);

      await doctor.save();
    }

    console.log(`[CRON] Cleaned expired slots at ${new Date().toISOString()}`);
  } catch (err) {
    console.error('[CRON ERROR]', err);
  }
};

// ⏱ Run every 30 minutes
cron.schedule('*/30 * * * *', cleanExpiredSlots);

module.exports = cleanExpiredSlots;
