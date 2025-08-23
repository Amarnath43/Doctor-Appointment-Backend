// mailers/appointments.js
const { sendEmail } = require('./index');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const tzp = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(tzp);

// ---- utils -------------------------------------------------
const escapeHtml = s =>
  String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const BRAND = 'QuickMediLink';

const SUBJECT = {
  booked:  when => `✅ Appointment confirmed – ${when}`,
  cancel:  when => `❌ Appointment cancelled${when ? ` – ${when}` : ''}`,
  rebook:  when => `🔁 Appointment rescheduled – ${when}`,
};

const preheader = t =>
  `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#fff;opacity:0">${t}</div>`;

const wrap = (body, ph = '') => `
${ph ? preheader(ph) : ''}
<div dir="ltr" style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff;border:1px solid #eee;border-radius:12px">
  <div style="text-align:center;margin-bottom:12px">
    <div style="font-weight:800;font-size:20px;color:#111">${BRAND}</div>
  </div>
  ${body}
  <hr style="border:none;border-top:1px solid #eee;margin:20px 0" />
  <div style="font-size:12px;color:#6b7280;text-align:center">
    This is a system notification from ${BRAND}.
  </div>
</div>`;

const fmtDate = (utcISO, tz = 'Asia/Kolkata') => {
  const d = dayjs.utc(utcISO);
  return d.isValid() ? d.tz(tz).format('DD MMM YYYY, hh:mm A') : '';
};

// Shared appointment details block (reused for patient & doctor)
function renderApptBlock({
  when, tz, appointmentId, doctorName, patientName, hospitalName, notes
}) {
  return `
  <ul style="padding-left:18px;line-height:1.6;margin:10px 0 0">
    ${when ? `<li><strong>When:</strong> ${escapeHtml(when)} (${escapeHtml(tz)})</li>` : ''}
    ${doctorName ? `<li><strong>Doctor:</strong> Dr. ${escapeHtml(doctorName)}</li>` : ''}
    ${patientName ? `<li><strong>Patient:</strong> ${escapeHtml(patientName)}</li>` : ''}
    ${hospitalName ? `<li><strong>Location:</strong> ${escapeHtml(hospitalName)}</li>` : ''}
    ${appointmentId ? `<li><strong>ID:</strong> ${escapeHtml(appointmentId)}</li>` : ''}
    ${notes ? `<li><strong>Notes:</strong> ${escapeHtml(notes)}</li>` : ''}
  </ul>`;
}

// ---- patient emails ---------------------------------------
async function sendAppointmentBookedEmail(to, {
  patientName = 'there',
  doctorName, hospitalName, slotISO, tz = 'Asia/Kolkata', appointmentId
}) {
  const when = fmtDate(slotISO, tz);
  const subject = SUBJECT.booked(when);
  const html = wrap(`
    <h2 style="margin:0 0 10px;color:#111">Appointment Confirmed</h2>
    <p>Hi ${escapeHtml(patientName)}, your appointment has been <strong>confirmed</strong>.</p>
    ${renderApptBlock({ when, tz, appointmentId, doctorName, hospitalName })}
    <p style="margin-top:12px">Please arrive 10 minutes early.</p>
  `, `Appointment confirmed – ${when}`);
  const text =
`Appointment Confirmed

Hi ${patientName},

Doctor: Dr. ${doctorName}
When: ${when} (${tz})
Location: ${hospitalName}
${appointmentId ? `ID: ${appointmentId}\n` : ''}

Please arrive 10 minutes early.`;
  return sendEmail({ to, subject, html, text, replyTo: 'support@quickmedilink.in' });
}

async function sendAppointmentCancelledEmail(to, {
  patientName = 'there', doctorName, slotISO, tz = 'Asia/Kolkata', reason
}) {
  const when = slotISO ? fmtDate(slotISO, tz) : null;
  const subject = SUBJECT.cancel(when);
  const html = wrap(`
    <h2>Appointment Cancelled</h2>
    <p>Hi ${escapeHtml(patientName)}, your appointment ${when ? `for <strong>${escapeHtml(when)}</strong> ` : ''}has been <strong>cancelled</strong>.</p>
    ${reason ? `<p><em>Reason:</em> ${escapeHtml(reason)}</p>` : ''}
    <p>You can book a new slot anytime from your dashboard.</p>
  `, 'Your appointment was cancelled');
  const text =
`Appointment Cancelled

Hi ${patientName},
Your appointment ${when ? `for ${when} ` : ''}has been cancelled.
${reason ? `Reason: ${reason}\n` : ''}

You can book a new slot from your dashboard.`;
  return sendEmail({ to, subject, html, text, replyTo: 'support@quickmedilink.in' });
}

async function sendAppointmentRescheduledEmail(to, {
  patientName = 'there', doctorName, oldSlotISO, newSlotISO, tz = 'Asia/Kolkata', appointmentId
}) {
  const oldWhen = oldSlotISO ? fmtDate(oldSlotISO, tz) : 'previous time';
  const newWhen = fmtDate(newSlotISO, tz);
  const subject = SUBJECT.rebook(newWhen);
  const html = wrap(`
    <h2>Appointment Rescheduled</h2>
    <p>Hi ${escapeHtml(patientName)}, your appointment with <strong>Dr. ${escapeHtml(doctorName)}</strong> has been rescheduled.</p>
    ${renderApptBlock({ when: `Old: ${oldWhen} → New: ${newWhen}`, tz, appointmentId, doctorName })}
    <p style="margin-top:12px">If the new time doesn't work, you can pick another slot from your dashboard.</p>
  `, `Rescheduled to ${newWhen}`);
  const text =
`Appointment Rescheduled

Hi ${patientName},
Your appointment with Dr. ${doctorName} has been rescheduled.

Old: ${oldWhen} (${tz})
New: ${newWhen} (${tz})
${appointmentId ? `ID: ${appointmentId}\n` : ''}

If the new time doesn't work, pick another slot from your dashboard.`;
  return sendEmail({ to, subject, html, text, replyTo: 'support@quickmedilink.in' });
}

// ---- doctor emails ----------------------------------------
async function sendDoctorAppointmentBookedEmail(to, {
  doctorName = 'Doctor',
  patientName, hospitalName, slotISO, tz = 'Asia/Kolkata', appointmentId, notes
}) {
  const when = fmtDate(slotISO, tz);
  const subject = `🆕 New appointment – ${when}`;
  const html = wrap(`
    <h2>New Appointment</h2>
    <p>Hi Dr. ${escapeHtml(doctorName)}, you have a new confirmed appointment.</p>
    ${renderApptBlock({ when, tz, appointmentId, patientName, hospitalName, notes })}
  `, `New appointment at ${when}`);
  const text =
`New Appointment

Doctor: Dr. ${doctorName}
Patient: ${patientName}
When: ${when} (${tz})
Location: ${hospitalName}
${appointmentId ? `ID: ${appointmentId}\n` : ''}${notes ? `Notes: ${notes}\n` : ''}`;
  return sendEmail({ to, subject, html, text, replyTo: 'support@quickmedilink.in' });
}

async function sendDoctorAppointmentCancelledEmail(to, {
  doctorName = 'Doctor', patientName, slotISO, tz = 'Asia/Kolkata', reason
}) {
  const when = slotISO ? fmtDate(slotISO, tz) : null;
  const subject = `❌ Appointment cancelled${when ? ` – ${when}` : ''}`;
  const html = wrap(`
    <h2>Appointment Cancelled</h2>
    <p>Hi Dr. ${escapeHtml(doctorName)}, the appointment ${when ? `for <strong>${escapeHtml(when)}</strong> ` : ''}with <strong>${escapeHtml(patientName)}</strong> has been cancelled.</p>
    ${reason ? `<p><em>Reason:</em> ${escapeHtml(reason)}</p>` : ''}
  `, 'Appointment was cancelled');
  const text =
`Appointment Cancelled

Doctor: Dr. ${doctorName}
Patient: ${patientName}
${when ? `When: ${when} (${tz})\n` : ''}${reason ? `Reason: ${reason}\n` : ''}`;
  return sendEmail({ to, subject, html, text, replyTo: 'support@quickmedilink.in' });
}

async function sendDoctorAppointmentRescheduledEmail(to, {
  doctorName = 'Doctor', patientName, oldSlotISO, newSlotISO, tz = 'Asia/Kolkata', appointmentId
}) {
  const oldWhen = oldSlotISO ? fmtDate(oldSlotISO, tz) : 'previous time';
  const newWhen = fmtDate(newSlotISO, tz);
  const subject = `🔁 Appointment rescheduled – ${newWhen}`;
  const html = wrap(`
    <h2>Appointment Rescheduled</h2>
    <p>Hi Dr. ${escapeHtml(doctorName)}, the appointment with <strong>${escapeHtml(patientName)}</strong> has been rescheduled.</p>
    ${renderApptBlock({ when: `Old: ${oldWhen} → New: ${newWhen}`, tz, appointmentId, patientName })}
  `, `Rescheduled to ${newWhen}`);
  const text =
`Appointment Rescheduled

Doctor: Dr. ${doctorName}
Patient: ${patientName}
Old: ${oldWhen} (${tz})
New: ${newWhen} (${tz})
${appointmentId ? `ID: ${appointmentId}\n` : ''}`;
  return sendEmail({ to, subject, html, text, replyTo: 'support@quickmedilink.in' });
}

// Optional helper so controllers don't crash on email errors
async function safeSend(promiseFactory) {
  try { await promiseFactory(); } catch (e) { console.error('Email send failed:', e); }
}

module.exports = {
  // patient
  sendAppointmentBookedEmail,
  sendAppointmentCancelledEmail,
  sendAppointmentRescheduledEmail,
  // doctor
  sendDoctorAppointmentBookedEmail,
  sendDoctorAppointmentCancelledEmail,
  sendDoctorAppointmentRescheduledEmail,
  // helpers
  safeSend,
};
