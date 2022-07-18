console.log("Client side javascript file is running");

// fetch("http://puzzle.mead.io/puzzle").then((response) => {
//   response.json().then((data) => {
//     console.log(data);
//   });
// });

const weatherForm = document.querySelector("form");
const search = document.querySelector("input");
const messageLocation = document.querySelector("#message-location");
const messageWeather = document.querySelector("#message-weather");
const messageTemp = document.querySelector("#message-temp");
const messageHumidity = document.querySelector("#message-humidity");
const messageWindspeed = document.querySelector("#message-windspeed");
const messageVisibility = document.querySelector("#message-visibility");
const messagePressure = document.querySelector("#message-pressure");
const messageCountry = document.querySelector("#message-country");
const messageRegion = document.querySelector("#message-region");
const messageLocaltime = document.querySelector("#message-localtime");
const messageGlobalSite = document.querySelector("#message-global-site");

weatherForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const location = search.value;

  messageLocation.textContent = "Loading...";
  messageWeather.textContent = "";

  fetch("/weather?address=" + location).then((response) => {
    response.json().then((data) => {
      if (data.error) {
        return (messageLocation.textContent = data.error);
      } else {
        messageLocation.textContent = data.location;

        messageWeather.textContent = data.forecast.weather;
        messageTemp.textContent =
          `The temparature is ` +
          data.forecast.temparature +
          `°C` +
          `, it feelslike ` +
          data.forecast.feelslike +
          `°C`;

        messageHumidity.textContent =
          `Percentage of rain: ` + data.forecast.humidity + `%`;
        messageWindspeed.textContent =
          `Wind: ` + data.forecast.windspeed + ` kmph`;
        messageVisibility.textContent =
          `Visibility: ` + data.forecast.visibility + ` km`;
        messagePressure.textContent =
          `Pressure: ` + data.forecast.pressure + ` mb`;
        messageCountry.textContent = `Country: ` + data.forecast.country;
        messageRegion.textContent = `Region: ` + data.forecast.region;
        messageLocaltime.textContent = `Local time: ` + data.forecast.localtime;
        if (data.forecast.longitude > 0 && data.forecast.latitude > 0) {
          messageGlobalSite.textContent =
            `Coordinate: ` +
            data.forecast.longitude +
            `°E, ` +
            data.forecast.latitude +
            `°N`;
        } else if (data.forecast.longitude < 0 && data.forecast.latitude > 0) {
          messageGlobalSite.textContent =
            `Coordinate: ` +
            data.forecast.longitude +
            `°W, ` +
            data.forecast.latitude +
            `°N`;
        } else if (data.forecast.longitude > 0 && data.forecast.latitude < 0) {
          messageGlobalSite.textContent =
            `Coordinate: ` +
            data.forecast.longitude +
            `°E, ` +
            data.forecast.latitude +
            `°S`;
        } else if (data.forecast.longitude < 0 && data.forecast.latitude < 0) {
          messageGlobalSite.textContent =
            `Coordinate: ` +
            data.forecast.longitude +
            `°W, ` +
            data.forecast.latitude +
            `°S`;
        }
      }
    });
  });
});
