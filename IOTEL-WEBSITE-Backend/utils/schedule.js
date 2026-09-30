// Schedule times belong to the Philippine business timezone, not the server timezone.
function isFutureSlot(date, time, now = Date.now()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return false;
    const day = new Date(date + 'T00:00:00Z');
    if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date) return false;
    return Date.parse(`${date}T${time}:00+08:00`) > now;
}
module.exports = { isFutureSlot };
