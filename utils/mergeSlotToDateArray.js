const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
dayjs.extend(utc);

function mergeSlotToDateArray(array, date, slot) {
  //const dateStr = dayjs.utc(date).format('YYYY-MM-DD');

  const existing = array.find(d => {
    const formatted = dayjs.utc(d.date).format('YYYY-MM-DD');
    console.log("🔍 Comparing:", formatted, "==", date);
    return formatted === date;
  });

  if (existing) {
    existing.slots = Array.from(new Set([...existing.slots, slot])).sort();
  } else {
    array.push({
      date: dayjs.utc(date).startOf('day').toDate(),  // ✅ Force midnight UTC
      slots: [slot]
    });
  }
}

module.exports = mergeSlotToDateArray;
