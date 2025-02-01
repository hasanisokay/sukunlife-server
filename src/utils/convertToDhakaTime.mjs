function convertToDhakaTime(inputTime) {
    // Ensure inputTime is a valid Date object
    const date = new Date(inputTime);

    // Check if the input is a valid date
    if (isNaN(date.getTime())) {
        throw new Error("Invalid date provided");
    }

    // Use Intl.DateTimeFormat to format the date in Dhaka timezone (Asia/Dhaka)
    const dhakaTimeFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Dhaka',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false // Use 24-hour format
    });

    // Format the date to Dhaka timezone
    const formattedDhakaTime = dhakaTimeFormatter.format(date);

    return new Date(formattedDhakaTime);
}
export default convertToDhakaTime;