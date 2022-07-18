const request = require("request");

const forecast = (latitude, longitude, callback) => {
  const url =
    "http://api.weatherstack.com/current?access_key=e68c2a0e8a00368d1c13172543eef4f8&query=" +
    latitude +
    "," +
    longitude +
    "&units=m";

  request({ url, json: true }, (error, { body } = {}) => {
    if (error) {
      callback("Unable to connect to weather api", undefined);
    } else if (body.error) {
      callback("Unable to find location", undefined);
    } else {
      callback(undefined, {
        weather: body.current.weather_descriptions[0],
        icons: body.current.weather_icons[0],
        temparature: body.current.temperature,
        feelslike: body.current.feelslike,
        humidity: body.current.humidity,
        windspeed: body.current.wind_speed,
        uv: body.current.uv_index,
        visibility: body.current.visibility,
        pressure: body.current.pressure,
        country: body.location.country,
        region: body.location.region,
        localtime: body.location.localtime,
        longitude: body.location.lon,
        latitude: body.location.lat,
      });
    }
  });
};

module.exports = forecast;
