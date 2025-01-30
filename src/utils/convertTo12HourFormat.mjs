const convertTo12HourFormat = (timeStr) => {
    // Create a date object with the provided time in 24-hour format
    const [hours, minutes, seconds] = timeStr.split(":");
    const date = new Date();
    date.setHours(hours, minutes, seconds);
  
    // Get hours, minutes, seconds and AM/PM
    let hours12 = date.getHours() % 12;
    if (hours12 === 0) hours12 = 12; // Handle midnight as 12
    const minutesFormatted = date.getMinutes().toString().padStart(2, "0");
    const secondsFormatted = date.getSeconds().toString().padStart(2, "0");
    const ampm = date.getHours() >= 12 ? "PM" : "AM";
  
    return `${hours12}:${minutesFormatted}:${secondsFormatted} ${ampm}`;
  };
  export default convertTo12HourFormat;
  