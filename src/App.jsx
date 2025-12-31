import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import { DateTime, Duration } from 'luxon';
import './App.css';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const SITE_URL = 'https://nx10.dev/new-year-wave';
const TIMEZONE_MAP_URL = 'https://www.timeanddate.com/counters/newyearmap.html';

export default function App() {
  const svgRef = useRef(null);
  const [geoData, setGeoData] = useState(null);
  const [currentTime, setCurrentTime] = useState(DateTime.utc());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  
  // User location state
  const [userLocation, setUserLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState(null);
  
  // Hover state for countries
  const [hoveredCountry, setHoveredCountry] = useState(null);

  // Fetch geographic data
  useEffect(() => {
    const loadGeoData = async () => {
      try {
        const response = await fetch(GEO_URL);
        if (!response.ok) throw new Error('Failed to fetch map data');
        const topology = await response.json();
        const countries = topojson.feature(topology, topology.objects.countries);
        setGeoData(countries);
        setLoading(false);
      } catch (err) {
        console.error('Failed to load geo data:', err);
        setError(err.message);
        setLoading(false);
      }
    };
    loadGeoData();
  }, []);

  // Real-time clock update
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(DateTime.utc());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Calculate solar midnight longitude
  // Solar noon occurs at longitude = (12 - UTC_hour) * 15
  // Solar midnight is opposite solar noon, so:
  // Solar midnight longitude = (0 - UTC_hour) * 15 = -UTC_hour * 15
  // 
  // At UTC 00:00 → solar midnight at 0° (Greenwich)
  // At UTC 06:00 → solar midnight at -90° (western Atlantic)
  // At UTC 12:00 → solar midnight at -180°/180° (date line)
  // At UTC 18:00 → solar midnight at -270° = 90° (Asia)
  const solarMidnightLon = useMemo(() => {
    const totalHours = currentTime.hour + currentTime.minute / 60 + currentTime.second / 3600;
    
    let lon = -totalHours * 15;
    // Normalize to -180 to 180
    while (lon < -180) lon += 360;
    while (lon > 180) lon -= 360;
    return lon;
  }, [currentTime]);

  // Determine the relevant year for display
  const { displayYear, previousYear } = useMemo(() => {
    const year = currentTime.year;
    // If we're in December, the "new year" is next year
    if (currentTime.month === 12) {
      return { displayYear: year + 1, previousYear: year };
    }
    return { displayYear: year, previousYear: year - 1 };
  }, [currentTime]);

  // Check if we're in the new year transition window
  // The wave of solar midnight entering Jan 1 starts at Dec 31 12:00 UTC
  // (when solar midnight at lon=180° crosses into Jan 1 local solar date)
  // and completes at Jan 1 12:00 UTC (when solar midnight at lon=-180° finishes)
  const { inTransition, transitionComplete, beforeTransition } = useMemo(() => {
    const month = currentTime.month;
    const day = currentTime.day;
    const hour = currentTime.hour + currentTime.minute / 60;
    
    const isDec31 = month === 12 && day === 31;
    const isJan1 = month === 1 && day === 1;
    
    // Transition: Dec 31 12:00 UTC to Jan 1 12:00 UTC
    const inTransition = (isDec31 && hour >= 12) || (isJan1 && hour < 12);
    
    // Complete: Jan 1 12:00 UTC onwards (until next December)
    const transitionComplete = (isJan1 && hour >= 12) || 
                               (month === 1 && day > 1) || 
                               (month > 1 && month < 12);
    
    // Before: Dec 31 before 12:00 UTC, or earlier in December
    const beforeTransition = (isDec31 && hour < 12) || (month === 12 && day < 31);
    
    return { inTransition, transitionComplete, beforeTransition };
  }, [currentTime]);

  // Countdown to wave start (Dec 31 12:00 UTC)
  const countdown = useMemo(() => {
    if (!beforeTransition) return null;
    
    const year = currentTime.year;
    const waveStart = DateTime.utc(year, 12, 31, 12, 0, 0);
    const diff = waveStart.diff(currentTime, ['days', 'hours', 'minutes', 'seconds']);
    
    if (diff.toMillis() <= 0) return null;
    
    return {
      days: Math.floor(diff.days),
      hours: Math.floor(diff.hours),
      minutes: Math.floor(diff.minutes),
      seconds: Math.floor(diff.seconds),
      total: diff.toMillis()
    };
  }, [currentTime, beforeTransition]);

  // Check if a longitude has entered the new year
  // The wave starts at lon=180° (date line) at Dec 31 12:00 UTC and sweeps westward
  // A location is in the new year if solar midnight has passed there on Jan 1 (local solar date)
  const isNewYear = useMemo(() => {
    if (!inTransition && !transitionComplete) return () => false;
    if (transitionComplete) return () => true;
    
    // During transition: the midnight line sweeps westward from 180°
    // Locations WEST of 180° and EAST of the current midnight line are in the new year
    return (lon) => {
      // The wave started at 180° and the front is at solarMidnightLon
      // Everything "behind" the wave (between 180° going west to the current line) is in new year
      
      // Normalize longitude to -180 to 180
      const normLon = lon > 180 ? lon - 360 : (lon < -180 ? lon + 360 : lon);
      const normMidnight = solarMidnightLon;
      
      // The new year region is from the current midnight line (going eastward) to 180°
      // then wrapping from -180° back toward the midnight line
      // Actually simpler: new year = everywhere EAST of the midnight line
      
      if (normMidnight <= 0) {
        // Line is in western hemisphere (e.g., -30°)
        // New year: everything from normMidnight eastward to 180°
        return normLon > normMidnight;
      } else {
        // Line is in eastern hemisphere (e.g., 150°) - early in the wave
        // New year: from normMidnight to 180°
        return normLon > normMidnight || normLon < -180 + (180 - normMidnight);
        // Actually simpler: normLon > normMidnight (since we're near 180°)
        // But need to handle wrap... let's think again
        
        // If midnight is at 150°, new year is 150° to 180° plus -180° to -180° (nothing yet from west)
        // So just: normLon > normMidnight AND normLon <= 180
        // OR normLon >= -180 AND normLon < (normMidnight - 360) -- but that's always false
        // So just: normLon > normMidnight
        return normLon > normMidnight;
      }
    };
  }, [solarMidnightLon, inTransition, transitionComplete]);

  // Coverage percentage
  // 0% at Dec 31 12:00 UTC, 100% at Jan 1 12:00 UTC (24 hour window)
  const coverage = useMemo(() => {
    if (beforeTransition) return 0;
    if (transitionComplete) return 100;
    
    const month = currentTime.month;
    const day = currentTime.day;
    const hour = currentTime.hour + currentTime.minute / 60 + currentTime.second / 3600;
    
    if (month === 12 && day === 31) {
      // Dec 31 12:00-24:00 UTC = 0-50%
      return ((hour - 12) / 24) * 100;
    } else if (month === 1 && day === 1) {
      // Jan 1 00:00-12:00 UTC = 50-100%
      return ((hour + 12) / 24) * 100;
    }
    return 0;
  }, [currentTime, beforeTransition, transitionComplete]);

  // Local time
  const localTime = useMemo(() => {
    return DateTime.local();
  }, [currentTime]); // Update when currentTime updates

  // Calculate when solar midnight Jan 1 occurs at a given longitude
  const getSolarMidnightTime = useCallback((lon) => {
    // Solar midnight at longitude L occurs when UTC hour = -L/15 (mod 24)
    // For Jan 1 solar midnight at longitude L:
    // UTC time = (180 - L) / 15 hours after Dec 31 12:00 UTC
    const hoursAfterWaveStart = (180 - lon) / 15;
    const waveStart = DateTime.utc(currentTime.year, 12, 31, 12, 0, 0);
    return waveStart.plus({ hours: hoursAfterWaveStart });
  }, [currentTime.year]);

  // User's solar midnight time for Jan 1
  const userSolarMidnight = useMemo(() => {
    if (!userLocation) return null;
    return getSolarMidnightTime(userLocation.longitude);
  }, [userLocation, getSolarMidnightTime]);

  // Has user's location entered the new year?
  const userInNewYear = useMemo(() => {
    if (!userLocation) return false;
    return isNewYear(userLocation.longitude);
  }, [userLocation, isNewYear]);

  // Request user location
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      return;
    }
    
    setLocationLoading(true);
    setLocationError(null);
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationLoading(false);
      },
      (err) => {
        setLocationError('Unable to get your location');
        setLocationLoading(false);
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }, []);

  // Status text
  const status = useMemo(() => {
    if (transitionComplete) return 'Complete — Happy New Year! 🎉';
    
    if (inTransition) {
      // Wave goes: Pacific (180°) → Asia (90°) → Europe/Africa (0°) → Americas (-90°) → Pacific (-180°)
      if (solarMidnightLon > 120) return 'Wave Beginning — Pacific Islands';
      if (solarMidnightLon > 60) return 'Crossing East Asia & Australia';
      if (solarMidnightLon > 0) return 'Crossing South Asia & Middle East';
      if (solarMidnightLon > -30) return 'Crossing Europe & Africa';
      if (solarMidnightLon > -90) return 'Crossing the Atlantic';
      if (solarMidnightLon > -150) return 'Crossing the Americas';
      return 'Final Stretch — Pacific';
    }
    
    if (beforeTransition) {
      if (countdown && countdown.days === 0 && countdown.hours < 1) return 'Almost There...';
      if (countdown && countdown.days === 0) return 'Wave Starting Soon';
      return 'Awaiting Wave Start';
    }
    
    return 'Awaiting New Year';
  }, [currentTime, solarMidnightLon, inTransition, transitionComplete, beforeTransition, countdown]);

  // Format countdown display
  const countdownDisplay = useMemo(() => {
    if (!countdown) return null;
    
    const parts = [];
    if (countdown.days > 0) {
      parts.push(`${countdown.days}d`);
    }
    parts.push(
      `${String(countdown.hours).padStart(2, '0')}:${String(countdown.minutes).padStart(2, '0')}:${String(countdown.seconds).padStart(2, '0')}`
    );
    
    return parts.join(' ');
  }, [countdown]);

  // Share functionality
  const shareText = `Watch the ${displayYear} New Year sweep across the globe in real-time! 🌍✨`;
  
  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(SITE_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      const textArea = document.createElement('textarea');
      textArea.value = SITE_URL;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  const handleShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'New Year Wave',
          text: shareText,
          url: SITE_URL,
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          handleCopyLink();
        }
      }
    } else {
      handleCopyLink();
    }
  }, [shareText, handleCopyLink]);

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(SITE_URL)}`;

  // Render map with D3
  useEffect(() => {
    if (!geoData || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const width = 900;
    const height = 500;
    const margin = { top: 20, right: 20, bottom: 40, left: 50 };

    svg.selectAll('*').remove();

    const defs = svg.append('defs');

    // Glow filter
    const glow = defs.append('filter')
      .attr('id', 'glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');
    glow.append('feGaussianBlur')
      .attr('stdDeviation', '4')
      .attr('result', 'coloredBlur');
    const glowMerge = glow.append('feMerge');
    glowMerge.append('feMergeNode').attr('in', 'coloredBlur');
    glowMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Projection
    const projection = d3.geoEquirectangular()
      .scale((width - margin.left - margin.right) / (2 * Math.PI))
      .translate([width / 2, height / 2]);

    const pathGenerator = d3.geoPath().projection(projection);

    // Background
    svg.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', '#0a0a12');

    // Ocean
    svg.append('rect')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', width - margin.left - margin.right)
      .attr('height', height - margin.top - margin.bottom)
      .attr('fill', '#0d1b2a');

    // Midnight line glow gradient
    const midnightGlow = defs.append('linearGradient')
      .attr('id', 'midnightGlow')
      .attr('x1', '0%')
      .attr('x2', '100%');
    midnightGlow.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', 'rgba(45, 212, 191, 0)');
    midnightGlow.append('stop')
      .attr('offset', '50%')
      .attr('stop-color', 'rgba(45, 212, 191, 0.3)');
    midnightGlow.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', 'rgba(45, 212, 191, 0)');

    // New year shading
    const midnightX = projection([solarMidnightLon, 0])[0];
    const greenwichX = projection([0, 0])[0];
    const rightEdge = width - margin.right;
    const leftEdge = margin.left;
    
    const newYearGradient = defs.append('linearGradient')
      .attr('id', 'newYearGradient')
      .attr('x1', '0%')
      .attr('x2', '100%');
    newYearGradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', 'rgba(252, 211, 77, 0.2)');
    newYearGradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', 'rgba(251, 146, 60, 0.1)');

    if (inTransition) {
      // New year region: everything EAST of the midnight line
      // The midnight line sweeps westward, so new year grows from east (180°) toward west
      
      if (solarMidnightLon >= 0) {
        // Line is in eastern hemisphere (early in wave, e.g., 150°)
        // New year: from midnightX to right edge (180°)
        svg.append('rect')
          .attr('x', midnightX)
          .attr('y', margin.top)
          .attr('width', rightEdge - midnightX)
          .attr('height', height - margin.top - margin.bottom)
          .attr('fill', 'url(#newYearGradient)')
          .style('pointer-events', 'none');
      } else {
        // Line is in western hemisphere (e.g., -30°)
        // New year: from midnightX to right edge (wraps around)
        svg.append('rect')
          .attr('x', midnightX)
          .attr('y', margin.top)
          .attr('width', rightEdge - midnightX)
          .attr('height', height - margin.top - margin.bottom)
          .attr('fill', 'url(#newYearGradient)')
          .style('pointer-events', 'none');
      }
    } else if (transitionComplete) {
      svg.append('rect')
        .attr('x', leftEdge)
        .attr('y', margin.top)
        .attr('width', rightEdge - leftEdge)
        .attr('height', height - margin.top - margin.bottom)
        .attr('fill', 'url(#newYearGradient)')
        .style('pointer-events', 'none');
    }

    // Graticule
    const graticule = d3.geoGraticule().step([30, 30]);
    svg.append('path')
      .datum(graticule())
      .attr('d', pathGenerator)
      .attr('fill', 'none')
      .attr('stroke', 'rgba(100, 116, 139, 0.15)')
      .attr('stroke-width', 0.5);

    // Countries
    svg.selectAll('.country')
      .data(geoData.features)
      .enter()
      .append('path')
      .attr('class', 'country')
      .attr('d', pathGenerator)
      .attr('fill', d => {
        const centroid = d3.geoCentroid(d);
        if (centroid && isNewYear(centroid[0])) {
          return '#2a2a1a';
        }
        return '#1b263b';
      })
      .attr('stroke', 'rgba(45, 212, 191, 0.3)')
      .attr('stroke-width', 0.5)
      .style('cursor', 'pointer')
      .on('mouseenter', (event, d) => {
        // Only show on hover for non-touch devices
        if (window.matchMedia('(hover: hover)').matches) {
          const centroid = d3.geoCentroid(d);
          if (centroid) {
            const solarMidnightTime = getSolarMidnightTime(centroid[0]);
            setHoveredCountry({
              name: d.properties?.name || 'Unknown',
              longitude: centroid[0],
              solarMidnightTime,
              inNewYear: isNewYear(centroid[0])
            });
          }
        }
        d3.select(event.currentTarget)
          .attr('stroke', '#2dd4bf')
          .attr('stroke-width', 1.5);
      })
      .on('mouseleave', (event) => {
        // Only auto-hide on mouseleave for non-touch devices
        if (window.matchMedia('(hover: hover)').matches) {
          setHoveredCountry(null);
        }
        d3.select(event.currentTarget)
          .attr('stroke', 'rgba(45, 212, 191, 0.3)')
          .attr('stroke-width', 0.5);
      })
      .on('click', (event, d) => {
        // Toggle on click for touch devices
        event.stopPropagation();
        const centroid = d3.geoCentroid(d);
        if (centroid) {
          const solarMidnightTime = getSolarMidnightTime(centroid[0]);
          const countryName = d.properties?.name || 'Unknown';
          
          // If same country clicked, close it
          if (hoveredCountry?.name === countryName) {
            setHoveredCountry(null);
          } else {
            setHoveredCountry({
              name: countryName,
              longitude: centroid[0],
              solarMidnightTime,
              inNewYear: isNewYear(centroid[0])
            });
          }
        }
      });

    // Equator
    svg.append('line')
      .attr('x1', margin.left)
      .attr('x2', width - margin.right)
      .attr('y1', height / 2)
      .attr('y2', height / 2)
      .attr('stroke', 'rgba(100, 116, 139, 0.4)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '5,5');

    // Prime meridian marker (Greenwich)
    svg.append('line')
      .attr('x1', greenwichX)
      .attr('x2', greenwichX)
      .attr('y1', margin.top)
      .attr('y2', height - margin.bottom)
      .attr('stroke', 'rgba(100, 116, 139, 0.25)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3');

    // Midnight line (always visible)
    svg.append('rect')
      .attr('x', midnightX - 20)
      .attr('y', margin.top)
      .attr('width', 40)
      .attr('height', height - margin.top - margin.bottom)
      .attr('fill', 'url(#midnightGlow)')
      .style('pointer-events', 'none');

    svg.append('line')
      .attr('x1', midnightX)
      .attr('x2', midnightX)
      .attr('y1', margin.top)
      .attr('y2', height - margin.bottom)
      .attr('stroke', '#2dd4bf')
      .attr('stroke-width', 2)
      .attr('filter', 'url(#glow)')
      .style('pointer-events', 'none');

    // User location marker
    if (userLocation) {
      const userX = projection([userLocation.longitude, userLocation.latitude])[0];
      const userY = projection([userLocation.longitude, userLocation.latitude])[1];
      
      // Pulsing circle
      svg.append('circle')
        .attr('cx', userX)
        .attr('cy', userY)
        .attr('r', 12)
        .attr('fill', 'rgba(251, 146, 60, 0.3)')
        .attr('class', 'user-pulse');
      
      // Inner circle
      svg.append('circle')
        .attr('cx', userX)
        .attr('cy', userY)
        .attr('r', 6)
        .attr('fill', '#fb923c')
        .attr('stroke', '#fff')
        .attr('stroke-width', 2);
      
      // Label
      svg.append('text')
        .attr('x', userX)
        .attr('y', userY - 16)
        .attr('text-anchor', 'middle')
        .attr('fill', '#fb923c')
        .attr('font-family', '"JetBrains Mono", monospace')
        .attr('font-size', '10px')
        .attr('font-weight', 'bold')
        .text('YOU');
    }

    // Axes
    const lonScale = d3.scaleLinear()
      .domain([-180, 180])
      .range([margin.left, width - margin.right]);

    const latScale = d3.scaleLinear()
      .domain([90, -90])
      .range([margin.top, height - margin.bottom]);

    svg.append('g')
      .attr('transform', `translate(0, ${height - margin.bottom + 5})`)
      .call(d3.axisBottom(lonScale)
        .tickValues([-180, -120, -60, 0, 60, 120, 180])
        .tickFormat(d => `${d}°`))
      .attr('color', '#64748b')
      .attr('font-family', '"JetBrains Mono", monospace')
      .attr('font-size', '10px');

    svg.append('g')
      .attr('transform', `translate(${margin.left - 5}, 0)`)
      .call(d3.axisLeft(latScale)
        .tickValues([-60, -30, 0, 30, 60])
        .tickFormat(d => `${d}°`))
      .attr('color', '#64748b')
      .attr('font-family', '"JetBrains Mono", monospace')
      .attr('font-size', '10px');

  }, [geoData, currentTime, solarMidnightLon, isNewYear, inTransition, transitionComplete, userLocation, getSolarMidnightTime]);

  // Format time for display
  const formatTime = (dt) => {
    return dt.toFormat('yyyy-MM-dd HH:mm:ss') + ' UTC';
  };

  const formatLongitude = (lon) => {
    const dir = lon >= 0 ? 'E' : 'W';
    return `${Math.abs(lon).toFixed(2)}° ${dir}`;
  };

  // Generate stars
  const stars = useMemo(() => {
    return [...Array(150)].map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      size: `${Math.random() * 2 + 1}px`,
      delay: `${Math.random() * 3}s`,
      duration: `${Math.random() * 2 + 2}s`,
    }));
  }, []);

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    window.location.reload();
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <div className="loading-text">Loading map data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <div className="error-text">Failed to load map: {error}</div>
        <button className="retry-button" onClick={handleRetry}>
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="starfield" aria-hidden="true">
        {stars.map(star => (
          <div
            key={star.id}
            className="star"
            style={{
              left: star.left,
              top: star.top,
              width: star.size,
              height: star.size,
              animationDelay: star.delay,
              animationDuration: star.duration,
            }}
          />
        ))}
      </div>

      <div className="content">
        <header className="header">
          <h1 className="title">New Year Wave</h1>
          <p className="subtitle">
            {inTransition || transitionComplete 
              ? `${displayYear} Sweeping the Globe`
              : `Tracking ${displayYear}'s Arrival`
            }
          </p>
        </header>

        {/* Countdown (only before transition) */}
        {countdown && (
          <div className="countdown-section">
            <div className="countdown-label">Wave Starts In</div>
            <div className="countdown-value">{countdownDisplay}</div>
          </div>
        )}

        <div className="globe-wrapper">
          <div className="globe-container">
            <svg
              ref={svgRef}
              viewBox="0 0 900 500"
              role="img"
              aria-label={`World map showing the progress of the ${displayYear} new year wave`}
              onClick={(e) => {
                // Dismiss tooltip when clicking on svg background (not a country)
                if (e.target.tagName === 'svg' || e.target.tagName === 'rect') {
                  setHoveredCountry(null);
                }
              }}
            />
            {/* Desktop tooltip - overlays map */}
            {hoveredCountry && (
              <div className="country-tooltip desktop-only">
                <div className="tooltip-title">{hoveredCountry.name}</div>
                <div className="tooltip-info">
                  Solar midnight {displayYear}:
                  <span className="tooltip-time">
                    {hoveredCountry.solarMidnightTime.toLocal().toFormat('MMM d, HH:mm')}
                  </span>
                </div>
                <div className={`tooltip-status ${hoveredCountry.inNewYear ? 'new-year' : 'old-year'}`}>
                  {hoveredCountry.inNewYear ? `✓ In ${displayYear}` : `Waiting for ${displayYear}`}
                </div>
              </div>
            )}
          </div>
          
          {/* Mobile tooltip - below map with reserved space */}
          <div className="mobile-tooltip-container mobile-only">
            {hoveredCountry ? (
              <div className="country-tooltip-mobile">
                <button 
                  className="tooltip-close" 
                  onClick={() => setHoveredCountry(null)}
                  aria-label="Close"
                >
                  ×
                </button>
                <div className="tooltip-title">{hoveredCountry.name}</div>
                <div className="tooltip-info">
                  Solar midnight {displayYear}:
                  <span className="tooltip-time">
                    {hoveredCountry.solarMidnightTime.toLocal().toFormat('MMM d, HH:mm')}
                  </span>
                </div>
                <div className={`tooltip-status ${hoveredCountry.inNewYear ? 'new-year' : 'old-year'}`}>
                  {hoveredCountry.inNewYear ? `✓ In ${displayYear}` : `Waiting for ${displayYear}`}
                </div>
              </div>
            ) : (
              <div className="tooltip-placeholder">
                Tap a country to see its solar midnight time
              </div>
            )}
          </div>
        </div>

        {/* Status bar */}
        <div className="status-bar">
          <div className="local-time">
            <span className="time-value">{localTime.toFormat('HH:mm:ss')}</span>
            <span className="time-label">{localTime.toFormat('cccc, MMM d')}</span>
          </div>
          <div className="status-info">
            <span className="status-text">{status}</span>
            {inTransition && (
              <span className="coverage-text">{coverage.toFixed(0)}% complete</span>
            )}
          </div>
        </div>

        {/* User location section */}
        <div className="your-location-section">
          {!userLocation ? (
            <button 
              className="location-button"
              onClick={requestLocation}
              disabled={locationLoading}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
              </svg>
              {locationLoading ? 'Finding you...' : 'Find My Location'}
            </button>
          ) : (
            <div className="your-location-card">
              <div className="your-location-header">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                </svg>
                <span>Your Location</span>
              </div>
              <div className="your-location-coords">
                {Math.abs(userLocation.latitude).toFixed(2)}°{userLocation.latitude >= 0 ? 'N' : 'S'},{' '}
                {Math.abs(userLocation.longitude).toFixed(2)}°{userLocation.longitude >= 0 ? 'E' : 'W'}
              </div>
              {userSolarMidnight && (
                <div className="your-location-midnight">
                  <span className="midnight-label">Your solar midnight {displayYear}:</span>
                  <span className="midnight-time">
                    {userSolarMidnight.toFormat('MMM d, HH:mm')} UTC
                  </span>
                  <span className="midnight-local">
                    ({userSolarMidnight.toLocal().toFormat('HH:mm')} your time)
                  </span>
                </div>
              )}
              <div className={`your-location-status ${userInNewYear ? 'in-new-year' : ''}`}>
                {userInNewYear 
                  ? `🎉 You're in ${displayYear}!` 
                  : `⏳ Waiting for ${displayYear}...`
                }
              </div>
            </div>
          )}
          {locationError && (
            <div className="location-error">{locationError}</div>
          )}
        </div>

        <div className="legend">
          <div className="legend-item">
            <div className="legend-color old-year" />
            <span>{previousYear}</span>
          </div>
          <div className="legend-item">
            <div className="legend-color midnight-line" />
            <span>Solar Midnight</span>
          </div>
          <div className="legend-item">
            <div className="legend-color new-year" />
            <span>{displayYear}</span>
          </div>
        </div>

        <div className="explanation">
          <p>
            This shows the <strong>astronomical new year</strong> — when local{' '}
            <em>solar midnight</em> (sun at its lowest point) crosses into January 1st.
            The wave begins at the Date Line (180°) and travels{' '}
            <strong>westward at ~1,670 km/h</strong>, taking 24 hours to circle the globe.
          </p>
          <p className="timezone-note">
            Looking for timezone-based midnight instead?{' '}
            <a href={TIMEZONE_MAP_URL} target="_blank" rel="noopener noreferrer">
              View the timezone new year map →
            </a>
          </p>
        </div>

        <div className="share-section">
          <div className="share-label">Share with friends</div>
          <div className="share-buttons">
            <button 
              className={`share-button ${copied ? 'copied' : ''}`}
              onClick={handleShare}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              {copied ? 'Copied!' : 'Share'}
            </button>
            <a 
              className="share-button"
              href={twitterUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              Post
            </a>
          </div>
        </div>

        <footer className="footer">
          <div>
            Real-time solar midnight visualization
            <span className="footer-divider">•</span>
            <a href="https://github.com/nx10/new-year-wave" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <span className="footer-divider">•</span>
            Made by <a href="https://github.com/nx10" target="_blank" rel="noopener noreferrer">nx10</a>
          </div>
        </footer>
      </div>
    </div>
  );
}