() => {
  const ids = ["sc_ace","sc_acrimsat","sc_acs3","sc_aqua","sc_sac_d","sc_artemis_1","sc_artemis_2","sc_themis_b","sc_themis_c","sc_aura","sc_biosentinel","sc_calipso","sc_capstone","sc_cassini","sc_chandra","sc_clementine","sc_cloudsat","sc_cygnss_1","sc_cygnss_2","sc_cygnss_3","sc_cygnss_4","sc_cygnss_5","sc_cygnss_6","sc_cygnss_7","sc_cygnss_8","sc_danuri","sc_dart","sc_dawn","sc_deep_impact","sc_deep_impact_impactor","sc_deep_space_1","sc_dscovr","sc_eo_1","sc_escapade_blue","sc_escapade_gold","sc_euclid","sc_europa_clipper","sc_explorer_1","sc_galileo","sc_galileo_probe","sc_geotail","sc_gpm","sc_grace_1","sc_grace_2","sc_grace_fo1","sc_grace_fo2","sc_grail_a","sc_grail_b","sc_grifex","sc_hubble_space_telescope","sc_huygens","sc_ibex","sc_icesat_2","sc_image","sc_imap","sc_insight","sc_iss","sc_ipex","sc_isas","sc_ixpe","sc_jwst","sc_jason_1","sc_jason_2","sc_jason_3","sc_juice","sc_juno","sc_kepler_space_telescope","sc_ladee","sc_landsat_7","sc_landsat_8","sc_landsat_9","sc_lcross","sc_lucy","sc_lunar_flashlight","sc_lunar_prospector","sc_lunar_reconnaissance_orbiter","sc_magellan","sc_marco_a","sc_marco_b","sc_mariner_2","sc_mars_2020","sc_mars_exploration_rover_2","sc_mars_exploration_rover_1","sc_mars_express","sc_mars_global_surveyor","sc_mars_odyssey","sc_mars_reconnaissance_orbiter","sc_mars_science_laboratory","sc_maven","sc_mcubed_2","sc_messenger","sc_mms_1","sc_mms_2","sc_mms_3","sc_mms_4","sc_roman_space_telescope","sc_near_shoemaker","sc_neo_surveyor","sc_new_horizons","sc_nisar","sc_nustar","sc_oco_2","sc_osiris_rex","sc_osiris_rex_src","sc_pace","sc_parker_solar_probe","sc_philae","sc_phoenix","sc_pioneer_10","sc_pioneer_11","sc_polar","sc_prefire_1","sc_prefire_2","sc_psyche","sc_quikscat","sc_raincube","sc_rosetta","sc_cluster_ii_fm5","sc_cluster_ii_fm6","sc_cluster_ii_fm7","sc_sentinel_6","sc_sentinel_6b","sc_smap","sc_soho","sc_sdo","sc_solar_1","sc_sorce","sc_spherex","sc_spitzer","sc_stardust","sc_stardust_src","sc_starling_1","sc_starling_2","sc_starling_3","sc_starling_4","sc_stereo_ahead","sc_stereo_behind","sc_suomi_npp","sc_swot","sc_cluster_ii_fm8","sc_tdrs_10","sc_tdrs_11","sc_tdrs_12","sc_tdrs_13","sc_tdrs_3","sc_tdrs_5","sc_tdrs_6","sc_tdrs_7","sc_tdrs_8","sc_tdrs_9","sc_tempo","sc_terra","sc_tess","sc_themis_a","sc_themis_d","sc_themis_e","sc_trace_gas_orbiter","sc_trmm","sc_tropics_01","sc_tropics_03","sc_tropics_05","sc_tropics_06","sc_tropics_07","sc_ulysses","sc_rbsp_a","sc_rbsp_b","sc_voyager_1","sc_voyager_2","sc_wind"];
  const titles = {};
  const errs = {};
  let ok = 0;
  // 12 at a time so we do not hammer the CDN.
  for (let i = 0; i < ids.length; i += 12) {
    const batch = ids.slice(i, i + 12);
    await Promise.all(batch.map(async (id) => {
      try {
        const r = await fetch('/apps/solar-system/events/' + id + '/all_events.json');
        if (!r.ok) { errs[r.status] = (errs[r.status] || 0) + 1; return; }
        const j = await r.json();
        ok++;
        for (const e of Object.values(j)) {
          if (e && e.title) (titles[e.title] ||= []).push(id);
        }
      } catch (err) { errs.fetch = (errs.fetch || 0) + 1; }
    }));
  }
  return JSON.stringify({ filesOk: ok, errs, distinctTitles: Object.keys(titles).length, titles: Object.fromEntries(Object.entries(titles).map(([k, v]) => [k, v.length])) });
}
