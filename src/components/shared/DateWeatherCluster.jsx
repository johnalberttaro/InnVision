import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../utils/portalTheme';

// Hotel's fixed real-world location (matches the "Cebu City" label this
// cluster shows). A training hotel doesn't move, so this is a constant
// rather than something read off device geolocation — that would also
// mean a permission prompt for no real benefit, and wouldn't behave the
// same way on the web build anyway.
const CEBU_CITY_COORDS = { latitude: 10.3157, longitude: 123.8854 };
// Current conditions don't change fast enough to justify polling more
// often than this.
const WEATHER_REFRESH_MS = 15 * 60 * 1000;

// Open-Meteo's WMO weathercode → icon + accent color
// (https://open-meteo.com/en/docs). Not every code is listed
// individually — variants that read the same at a glance (every
// rain-shower code, say) share one entry, and anything unlisted falls
// back to DEFAULT_WEATHER_META rather than showing nothing.
const WEATHER_CODE_META = {
  0: { icon: 'sunny-outline', color: '#D9930E', label: 'Clear' },
  1: { icon: 'partly-sunny-outline', color: '#D9930E', label: 'Mostly clear' },
  2: { icon: 'partly-sunny-outline', color: '#D9930E', label: 'Partly cloudy' },
  3: { icon: 'cloud-outline', color: '#8A8F98', label: 'Overcast' },
  45: { icon: 'cloud-outline', color: '#8A8F98', label: 'Fog' },
  48: { icon: 'cloud-outline', color: '#8A8F98', label: 'Fog' },
  51: { icon: 'rainy-outline', color: '#2C5EA8', label: 'Drizzle' },
  53: { icon: 'rainy-outline', color: '#2C5EA8', label: 'Drizzle' },
  55: { icon: 'rainy-outline', color: '#2C5EA8', label: 'Drizzle' },
  61: { icon: 'rainy-outline', color: '#2C5EA8', label: 'Rain' },
  63: { icon: 'rainy-outline', color: '#2C5EA8', label: 'Rain' },
  65: { icon: 'rainy-outline', color: '#2C5EA8', label: 'Heavy rain' },
  80: { icon: 'rainy-outline', color: '#2C5EA8', label: 'Rain showers' },
  81: { icon: 'rainy-outline', color: '#2C5EA8', label: 'Rain showers' },
  82: { icon: 'rainy-outline', color: '#2C5EA8', label: 'Heavy showers' },
  95: { icon: 'thunderstorm-outline', color: '#5B4B8A', label: 'Thunderstorm' },
  96: { icon: 'thunderstorm-outline', color: '#5B4B8A', label: 'Thunderstorm' },
  99: { icon: 'thunderstorm-outline', color: '#5B4B8A', label: 'Thunderstorm' },
};
const DEFAULT_WEATHER_META = { icon: 'partly-sunny-outline', color: colors.primary, label: 'Weather' };

function weatherMetaFor(code) {
  return WEATHER_CODE_META[code] || DEFAULT_WEATHER_META;
}

/**
 * DateWeatherCluster — live clock + current weather (hardcoded to Cebu
 * City — this is a fixed training hotel, not a device location).
 * Factored out of DashboardNavbar.jsx (Front Desk/Admin's shared top
 * bar) so any other shell's own top bar can show the same info without
 * duplicating the fetch/timer logic — currently also used by
 * FnbShell.jsx.
 *
 * Self-contained: no props. Just render it inside a flex row. It does
 * NOT render its own leading/trailing divider — whether one belongs
 * depends on what else shares that row in the caller (DashboardNavbar
 * puts one before it, next to the bell; FnbShell's top bar has nothing
 * else on that side, so it renders this directly). It does render its
 * own divider BETWEEN the date and weather blocks, since that's
 * internal to the cluster regardless of where it's placed.
 */
export default function DateWeatherCluster() {
  const [clockNow, setClockNow] = useState(new Date());
  const [weather, setWeather] = useState(null); // { temp, code } | null while loading/unavailable

  useEffect(() => {
    const clockInterval = setInterval(() => setClockNow(new Date()), 1000);
    return () => clearInterval(clockInterval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadWeather = async () => {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${CEBU_CITY_COORDS.latitude}&longitude=${CEBU_CITY_COORDS.longitude}&current_weather=true`;
        const res = await fetch(url);
        const json = await res.json();
        if (!cancelled && json?.current_weather) {
          setWeather({ temp: json.current_weather.temperature, code: json.current_weather.weathercode });
        }
      } catch (err) {
        console.error('Failed to load weather:', err);
        // Leave `weather` as whatever it last was — a stale reading beats
        // the block disappearing, and a first-load failure just keeps
        // showing the "—°C" placeholder below instead of throwing.
      }
    };
    loadWeather();
    const weatherInterval = setInterval(loadWeather, WEATHER_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(weatherInterval);
    };
  }, []);

  const dateLine = `Today, ${clockNow.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
  const dayTimeLine = `${clockNow.toLocaleDateString('en-US', { weekday: 'short' })} • ${clockNow.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  const weatherMeta = weatherMetaFor(weather?.code);

  return (
    <>
      <View style={styles.infoBlock}>
        <Ionicons name="calendar-outline" size={16} color={colors.primary} />
        <View>
          <Text style={styles.infoPrimary}>{dateLine}</Text>
          <Text style={styles.infoSecondary}>{dayTimeLine}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.infoBlock}>
        <Ionicons name={weatherMeta.icon} size={18} color={weatherMeta.color} />
        <View>
          <Text style={styles.infoPrimary}>{weather ? `${Math.round(weather.temp)}°C` : '—°C'}</Text>
          <Text style={styles.infoSecondary}>Cebu City</Text>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  divider: { width: 1, height: 28, backgroundColor: colors.border },
  infoBlock: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoPrimary: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text },
  infoSecondary: { fontSize: 10.5, fontFamily: fonts.body, color: colors.textMuted, marginTop: 1 },
});