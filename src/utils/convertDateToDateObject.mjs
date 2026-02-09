const convertDateToDateObject = (d) => {
  const [day, month, year] = d?.split("-");
  const dateObj = new Date(`${year}-${month}-${day}`);
  return dateObj;
};

export default convertDateToDateObject;

export const convertISODateToDateObject = (d) => {
  if (!d) return null;

  const [year, month, day] = d.split("-");
  return new Date(Number(year), Number(month) - 1, Number(day));
};

export const convertTo12Hour = (time24) => {
  if (!time24) return "";
  const [hours, minutes] = time24.split(":");
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
};

export const capitalize = (s) => {
    try {
      if (s.length > 1) {
        return s.charAt(0).toUpperCase() + s.slice(1);
      } else if (s.length === 1) return s.toUpperCase();
      else return "";
    } catch {
      return "";
    }
  };

 
export const formatDateWithOrdinal = (dateString) => {
 if (!dateString) return "";

  const [year, month, day] = dateString.split("-");

  const date = new Date(Number(year), Number(month) - 1, Number(day));

  const monthName = date.toLocaleString("en-US", { month: "long" });

  const getOrdinal = (n) => {
    if (n > 3 && n < 21) return "th";
    switch (n % 10) {
      case 1: return "st";
      case 2: return "nd";
      case 3: return "rd";
      default: return "th";
    }
  };

  return `${day}${getOrdinal(Number(day))} ${monthName} ${year}`;
};
