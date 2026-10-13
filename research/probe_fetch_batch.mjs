() => {
  const ids = [
    'sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune',
    '134340_pluto', '1_ceres', '136199_eris', '136108_haumea', '136472_makemake', '90377_sedna',
    'moon', 'phobos', 'deimos', 'io', 'europa', 'ganymede', 'callisto', 'titan', 'enceladus',
    'iapetus', 'rhea', 'dione', 'tethys', 'mimas', 'triton', 'charon', 'miranda', 'titania',
    'oberon', 'ariel', 'umbriel', '16_psyche', '4_vesta', '2_pallas', '101955_bennu', '162173_ryugu',
    '486958_arrokoth', '65803_didymos', 'dimorphos', '1p_halley', '67p_churyumov_gerasimenko',
    'sc_voyager_1', 'sc_voyager_2', 'sc_pioneer_10', 'sc_pioneer_11', 'sc_new_horizons',
    'sc_cassini', 'sc_juno', 'sc_europa_clipper', 'sc_parker_solar_probe', 'sc_jwst',
    'sc_hubble_space_telescope', 'sc_mars_2020', 'sc_mars_science_laboratory', 'sc_insight',
    'sc_phoenix', 'sc_iss', 'sc_lucy', 'sc_psyche', 'sc_osiris_rex', 'sc_dart', 'sc_artemis_1',
    'sc_artemis_2', 'sc_roman_space_telescope', 'sc_mars_odyssey', 'sc_mars_reconnaissance_orbiter',
    'sc_messenger', 'sc_galileo', 'sc_magellan', 'sc_curiocity', 'sc_kepler_space_telescope',
    'sc_tess', 'sc_spitzer_space_telescope', 'sc_chandra', 'sc_sdo', 'sc_soho', 'sc_ulysses',
    'sc_rosetta', 'sc_stardust', 'sc_deep_impact', 'sc_dawn', 'sc_clementine',
    'sc_lunar_reconnaissance_orbiter', 'sc_grail_a', 'sc_maven', 'sc_mars_express',
    'sc_trace_gas_orbiter', 'sc_explorer_1', 'sc_mariner_2', 'sc_huygens', 'sc_viking_1',
  ].filter((x) => x !== 'sc_curiocity');
  const ok = {};
  const fail = [];
  for (const id of ids) {
    try {
      const r = await fetch('/apps/solar-system/descriptions/' + id + '.json');
      if (r.ok) ok[id] = await r.json();
      else fail.push(id + ':' + r.status);
    } catch (e) { fail.push(id + ':err'); }
  }
  return JSON.stringify({ ok, fail });
}
