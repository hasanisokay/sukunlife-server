const convertDateToDateObject = (d) => {
  const [day, month, year] = d?.split("-");
  const dateObj = new Date(`${year}-${month}-${day}`);
  return dateObj;
};

export default convertDateToDateObject;
