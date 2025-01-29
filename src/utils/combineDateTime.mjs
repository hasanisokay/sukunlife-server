const combineDateTime =(date, time)=> {
  const dateObj = new Date(date);
  const [timePart, modifier] = time?.split(" ");
  let [hours, minutes] = timePart.split(":").map(Number);
  if (modifier.toLowerCase() === "pm" && hours !== 12) {
    hours += 12;
  } else if (modifier.toLowerCase() === "am" && hours === 12) {
    hours = 0;
  }
  dateObj.setUTCHours(hours, minutes, 0, 0);
  
  return dateObj;
}

export default combineDateTime;