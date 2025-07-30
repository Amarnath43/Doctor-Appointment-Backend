const dayjs = require('dayjs');

function getNextAvailableSlot(availability) {
  const now = dayjs();

  const sortedAvailability = availability
    .filter(entry => Array.isArray(entry.slots) && entry.slots.length > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  for (const entry of sortedAvailability) {
    const dateStr = dayjs(entry.date).format('YYYY-MM-DD');
    const validSlots = entry.slots
      .map(slot => ({
        time: slot,
        dateTime: dayjs(`${dateStr}T${slot}`)
      }))
      .filter(slotObj => slotObj.dateTime.isAfter(now))
      .sort((a, b) => a.dateTime - b.dateTime);

    if (validSlots.length > 0) {
      return {
        date: dateStr,
        time: validSlots[0].time,
        dateTime: validSlots[0].dateTime.format('YYYY-MM-DDTHH:mm')
      };
    }
  }
 console.log('No valid slots found for availability:', availability);
  return null;
}

module.exports = getNextAvailableSlot;
