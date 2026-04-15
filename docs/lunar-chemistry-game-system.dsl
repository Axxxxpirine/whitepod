# AUTO-GÉNÉRÉ — Mauvoisin Réseau de Pétri ouvert (places globales)
# Modèle: places globales (surface/bus/stock) + lancement/purge/terminaison
# Source: docs/gdd/lunar-chemistry-petrinet.dsl
# Places source (hors contrôle): 61
# Transitions source (hors contrôle/purge): 61
# Extractibles tier0: lunar_helium3, lunar_hydrogen, lunar_oxygen, lunar_regolith

## Contrôle
;init start -> run
;launch run rocket_ready_stock -> done run

## Extraction (niveau 0 uniquement)
;extract__lunar_helium3 run -> run lunar_helium3_surface
;extract__lunar_hydrogen run -> run lunar_hydrogen_surface
;extract__lunar_oxygen run -> run lunar_oxygen_surface
;extract__lunar_regolith run -> run lunar_regolith_surface

## Convoyage (uniforme)
;convey__air_filtration run air_filtration_surface -> run air_filtration_bus
;convey__aluminum_ingots run aluminum_ingots_surface -> run aluminum_ingots_bus
;convey__aluminum_oxide run aluminum_oxide_surface -> run aluminum_oxide_bus
;convey__ammonia run ammonia_surface -> run ammonia_bus
;convey__carbon_dioxide run carbon_dioxide_surface -> run carbon_dioxide_bus
;convey__carbon_fiber run carbon_fiber_surface -> run carbon_fiber_bus
;convey__cargo_container run cargo_container_surface -> run cargo_container_bus
;convey__ceramic_plates run ceramic_plates_surface -> run ceramic_plates_bus
;convey__combustion_chamber run combustion_chamber_surface -> run combustion_chamber_bus
;convey__communication_antenna run communication_antenna_surface -> run communication_antenna_bus
;convey__crew_module run crew_module_surface -> run crew_module_bus
;convey__emergency_system run emergency_system_surface -> run emergency_system_bus
;convey__escape_rocket run escape_rocket_surface -> run escape_rocket_bus
;convey__fertilizer_pellets run fertilizer_pellets_surface -> run fertilizer_pellets_bus
;convey__flight_computer run flight_computer_surface -> run flight_computer_bus
;convey__fuel_injector run fuel_injector_surface -> run fuel_injector_bus
;convey__fuel_pump run fuel_pump_surface -> run fuel_pump_bus
;convey__fuel_tank run fuel_tank_surface -> run fuel_tank_bus
;convey__fuel_valve run fuel_valve_surface -> run fuel_valve_bus
;convey__glass_panels run glass_panels_surface -> run glass_panels_bus
;convey__graphite run graphite_surface -> run graphite_bus
;convey__hatch_doors run hatch_doors_surface -> run hatch_doors_bus
;convey__heat_shield run heat_shield_surface -> run heat_shield_bus
;convey__hydrogen_fuel run hydrogen_fuel_surface -> run hydrogen_fuel_bus
;convey__instrumentation run instrumentation_surface -> run instrumentation_bus
;convey__iron_bars run iron_bars_surface -> run iron_bars_bus
;convey__iron_oxide run iron_oxide_surface -> run iron_oxide_bus
;convey__landing_gear run landing_gear_surface -> run landing_gear_bus
;convey__launch_adapter run launch_adapter_surface -> run launch_adapter_bus
;convey__life_support_gas run life_support_gas_surface -> run life_support_gas_bus
;convey__life_support_tank run life_support_tank_surface -> run life_support_tank_bus
;convey__liquid_oxygen run liquid_oxygen_surface -> run liquid_oxygen_bus
;convey__lunar_helium3 run lunar_helium3_surface -> run lunar_helium3_bus
;convey__lunar_hydrogen run lunar_hydrogen_surface -> run lunar_hydrogen_bus
;convey__lunar_oxygen run lunar_oxygen_surface -> run lunar_oxygen_bus
;convey__lunar_regolith run lunar_regolith_surface -> run lunar_regolith_bus
;convey__methane run methane_surface -> run methane_bus
;convey__navigation_system run navigation_system_surface -> run navigation_system_bus
;convey__nitrogen_fertilizer run nitrogen_fertilizer_surface -> run nitrogen_fertilizer_bus
;convey__nitrogen_gas run nitrogen_gas_surface -> run nitrogen_gas_bus
;convey__nozzle run nozzle_surface -> run nozzle_bus
;convey__oxidizer_pump run oxidizer_pump_surface -> run oxidizer_pump_bus
;convey__oxidizer_tank run oxidizer_tank_surface -> run oxidizer_tank_bus
;convey__oxidizer_valve run oxidizer_valve_surface -> run oxidizer_valve_bus
;convey__polymer_plastic run polymer_plastic_surface -> run polymer_plastic_bus
;convey__power_batteries run power_batteries_surface -> run power_batteries_bus
;convey__rocket_fuel run rocket_fuel_surface -> run rocket_fuel_bus
;convey__rocket_ready run rocket_ready_surface -> run rocket_ready_bus
;convey__seals_gaskets run seals_gaskets_surface -> run seals_gaskets_bus
;convey__silicon_dioxide run silicon_dioxide_surface -> run silicon_dioxide_bus
;convey__silicon_wafers run silicon_wafers_surface -> run silicon_wafers_bus
;convey__solar_panels run solar_panels_surface -> run solar_panels_bus
;convey__steel_bars run steel_bars_surface -> run steel_bars_bus
;convey__structural_frame run structural_frame_surface -> run structural_frame_bus
;convey__synthetic_methane run synthetic_methane_surface -> run synthetic_methane_bus
;convey__thermal_control run thermal_control_surface -> run thermal_control_bus
;convey__thrust_controller run thrust_controller_surface -> run thrust_controller_bus
;convey__water run water_surface -> run water_bus
;convey__water_recycler run water_recycler_surface -> run water_recycler_bus
;convey__windows run windows_surface -> run windows_bus
;convey__wiring_harness run wiring_harness_surface -> run wiring_harness_bus

## Stockage (uniforme)
;store__air_filtration run air_filtration_bus -> run air_filtration_stock
;store__aluminum_ingots run aluminum_ingots_bus -> run aluminum_ingots_stock
;store__aluminum_oxide run aluminum_oxide_bus -> run aluminum_oxide_stock
;store__ammonia run ammonia_bus -> run ammonia_stock
;store__carbon_dioxide run carbon_dioxide_bus -> run carbon_dioxide_stock
;store__carbon_fiber run carbon_fiber_bus -> run carbon_fiber_stock
;store__cargo_container run cargo_container_bus -> run cargo_container_stock
;store__ceramic_plates run ceramic_plates_bus -> run ceramic_plates_stock
;store__combustion_chamber run combustion_chamber_bus -> run combustion_chamber_stock
;store__communication_antenna run communication_antenna_bus -> run communication_antenna_stock
;store__crew_module run crew_module_bus -> run crew_module_stock
;store__emergency_system run emergency_system_bus -> run emergency_system_stock
;store__escape_rocket run escape_rocket_bus -> run escape_rocket_stock
;store__fertilizer_pellets run fertilizer_pellets_bus -> run fertilizer_pellets_stock
;store__flight_computer run flight_computer_bus -> run flight_computer_stock
;store__fuel_injector run fuel_injector_bus -> run fuel_injector_stock
;store__fuel_pump run fuel_pump_bus -> run fuel_pump_stock
;store__fuel_tank run fuel_tank_bus -> run fuel_tank_stock
;store__fuel_valve run fuel_valve_bus -> run fuel_valve_stock
;store__glass_panels run glass_panels_bus -> run glass_panels_stock
;store__graphite run graphite_bus -> run graphite_stock
;store__hatch_doors run hatch_doors_bus -> run hatch_doors_stock
;store__heat_shield run heat_shield_bus -> run heat_shield_stock
;store__hydrogen_fuel run hydrogen_fuel_bus -> run hydrogen_fuel_stock
;store__instrumentation run instrumentation_bus -> run instrumentation_stock
;store__iron_bars run iron_bars_bus -> run iron_bars_stock
;store__iron_oxide run iron_oxide_bus -> run iron_oxide_stock
;store__landing_gear run landing_gear_bus -> run landing_gear_stock
;store__launch_adapter run launch_adapter_bus -> run launch_adapter_stock
;store__life_support_gas run life_support_gas_bus -> run life_support_gas_stock
;store__life_support_tank run life_support_tank_bus -> run life_support_tank_stock
;store__liquid_oxygen run liquid_oxygen_bus -> run liquid_oxygen_stock
;store__lunar_helium3 run lunar_helium3_bus -> run lunar_helium3_stock
;store__lunar_hydrogen run lunar_hydrogen_bus -> run lunar_hydrogen_stock
;store__lunar_oxygen run lunar_oxygen_bus -> run lunar_oxygen_stock
;store__lunar_regolith run lunar_regolith_bus -> run lunar_regolith_stock
;store__methane run methane_bus -> run methane_stock
;store__navigation_system run navigation_system_bus -> run navigation_system_stock
;store__nitrogen_fertilizer run nitrogen_fertilizer_bus -> run nitrogen_fertilizer_stock
;store__nitrogen_gas run nitrogen_gas_bus -> run nitrogen_gas_stock
;store__nozzle run nozzle_bus -> run nozzle_stock
;store__oxidizer_pump run oxidizer_pump_bus -> run oxidizer_pump_stock
;store__oxidizer_tank run oxidizer_tank_bus -> run oxidizer_tank_stock
;store__oxidizer_valve run oxidizer_valve_bus -> run oxidizer_valve_stock
;store__polymer_plastic run polymer_plastic_bus -> run polymer_plastic_stock
;store__power_batteries run power_batteries_bus -> run power_batteries_stock
;store__rocket_fuel run rocket_fuel_bus -> run rocket_fuel_stock
;store__rocket_ready run rocket_ready_bus -> run rocket_ready_stock
;store__seals_gaskets run seals_gaskets_bus -> run seals_gaskets_stock
;store__silicon_dioxide run silicon_dioxide_bus -> run silicon_dioxide_stock
;store__silicon_wafers run silicon_wafers_bus -> run silicon_wafers_stock
;store__solar_panels run solar_panels_bus -> run solar_panels_stock
;store__steel_bars run steel_bars_bus -> run steel_bars_stock
;store__structural_frame run structural_frame_bus -> run structural_frame_stock
;store__synthetic_methane run synthetic_methane_bus -> run synthetic_methane_stock
;store__thermal_control run thermal_control_bus -> run thermal_control_stock
;store__thrust_controller run thrust_controller_bus -> run thrust_controller_stock
;store__water run water_bus -> run water_stock
;store__water_recycler run water_recycler_bus -> run water_recycler_stock
;store__windows run windows_bus -> run windows_stock
;store__wiring_harness run wiring_harness_bus -> run wiring_harness_stock

## Recettes (run sur *_stock, output vers *_surface)
;recipe__air_filtration run life_support_gas_stock -> run air_filtration_surface
;recipe__aluminum_ingots run aluminum_oxide_stock -> run aluminum_ingots_surface
;recipe__aluminum_oxide run lunar_regolith_stock -> run aluminum_oxide_surface
;recipe__ammonia_synthesis run lunar_hydrogen_stock*3 lunar_oxygen_stock*2 -> run ammonia_surface
;recipe__assemble_rocket run air_filtration_stock cargo_container_stock combustion_chamber_stock communication_antenna_stock crew_module_stock emergency_system_stock escape_rocket_stock flight_computer_stock fuel_injector_stock fuel_pump_stock fuel_tank_stock fuel_valve_stock hatch_doors_stock heat_shield_stock instrumentation_stock landing_gear_stock launch_adapter_stock life_support_tank_stock navigation_system_stock nozzle_stock oxidizer_pump_stock oxidizer_tank_stock oxidizer_valve_stock power_batteries_stock seals_gaskets_stock solar_panels_stock structural_frame_stock thermal_control_stock thrust_controller_stock water_recycler_stock windows_stock wiring_harness_stock -> run rocket_ready_surface
;recipe__carbon_dioxide run lunar_hydrogen_stock lunar_oxygen_stock -> run carbon_dioxide_surface
;recipe__carbon_fiber run graphite_stock nitrogen_gas_stock -> run carbon_fiber_surface
;recipe__cargo_container run aluminum_ingots_stock -> run cargo_container_surface
;recipe__ceramic_plates run aluminum_oxide_stock iron_oxide_stock -> run ceramic_plates_surface
;recipe__combustion_chamber run ceramic_plates_stock steel_bars_stock -> run combustion_chamber_surface
;recipe__communication_antenna run aluminum_ingots_stock carbon_fiber_stock -> run communication_antenna_surface
;recipe__crew_module run aluminum_ingots_stock glass_panels_stock -> run crew_module_surface
;recipe__emergency_system run silicon_wafers_stock -> run emergency_system_surface
;recipe__escape_rocket run rocket_fuel_stock -> run escape_rocket_surface
;recipe__fertilizer_pellets run nitrogen_fertilizer_stock -> run fertilizer_pellets_surface
;recipe__flight_computer run silicon_wafers_stock -> run flight_computer_surface
;recipe__fuel_injector run silicon_wafers_stock steel_bars_stock -> run fuel_injector_surface
;recipe__fuel_pump run graphite_stock steel_bars_stock -> run fuel_pump_surface
;recipe__fuel_tank run steel_bars_stock -> run fuel_tank_surface
;recipe__fuel_valve run ceramic_plates_stock steel_bars_stock -> run fuel_valve_surface
;recipe__glass_panels run silicon_wafers_stock -> run glass_panels_surface
;recipe__graphite run carbon_dioxide_stock -> run graphite_surface
;recipe__hatch_doors run aluminum_ingots_stock ceramic_plates_stock -> run hatch_doors_surface
;recipe__heat_shield run carbon_fiber_stock ceramic_plates_stock -> run heat_shield_surface
;recipe__hydrogen_fuel run water_stock -> run hydrogen_fuel_surface
;recipe__instrumentation run silicon_wafers_stock -> run instrumentation_surface
;recipe__iron_bars run iron_oxide_stock -> run iron_bars_surface
;recipe__iron_oxide run lunar_regolith_stock -> run iron_oxide_surface
;recipe__landing_gear run steel_bars_stock -> run landing_gear_surface
;recipe__launch_adapter run structural_frame_stock -> run launch_adapter_surface
;recipe__life_support_gas run liquid_oxygen_stock nitrogen_gas_stock -> run life_support_gas_surface
;recipe__life_support_tank run aluminum_ingots_stock -> run life_support_tank_surface
;recipe__liquid_oxygen run water_stock -> run liquid_oxygen_surface
;recipe__lunar_helium3_extraction run -> run lunar_helium3_surface
;recipe__lunar_hydrogen_extraction run -> run lunar_hydrogen_surface
;recipe__lunar_oxygen_extraction run -> run lunar_oxygen_surface
;recipe__lunar_regolith_extraction run -> run lunar_regolith_surface
;recipe__methane_synthesis run lunar_hydrogen_stock*4 lunar_oxygen_stock -> run methane_surface
;recipe__navigation_system run carbon_fiber_stock silicon_wafers_stock -> run navigation_system_surface
;recipe__nitrogen_fertilizer run ammonia_stock water_stock -> run nitrogen_fertilizer_surface
;recipe__nitrogen_gas run lunar_oxygen_stock*3 -> run nitrogen_gas_surface
;recipe__nozzle run ceramic_plates_stock steel_bars_stock -> run nozzle_surface
;recipe__oxidizer_pump run graphite_stock steel_bars_stock -> run oxidizer_pump_surface
;recipe__oxidizer_tank run steel_bars_stock -> run oxidizer_tank_surface
;recipe__oxidizer_valve run ceramic_plates_stock steel_bars_stock -> run oxidizer_valve_surface
;recipe__polymer_plastic run synthetic_methane_stock -> run polymer_plastic_surface
;recipe__power_batteries run aluminum_ingots_stock -> run power_batteries_surface
;recipe__rocket_fuel run hydrogen_fuel_stock liquid_oxygen_stock -> run rocket_fuel_surface
;recipe__seals_gaskets run polymer_plastic_stock -> run seals_gaskets_surface
;recipe__silicon_dioxide run lunar_regolith_stock -> run silicon_dioxide_surface
;recipe__silicon_wafers run silicon_dioxide_stock -> run silicon_wafers_surface
;recipe__solar_panels run aluminum_ingots_stock silicon_wafers_stock -> run solar_panels_surface
;recipe__steel_bars run aluminum_ingots_stock iron_bars_stock -> run steel_bars_surface
;recipe__structural_frame run aluminum_ingots_stock steel_bars_stock -> run structural_frame_surface
;recipe__synthetic_methane run methane_stock water_stock -> run synthetic_methane_surface
;recipe__thermal_control run glass_panels_stock -> run thermal_control_surface
;recipe__thrust_controller run silicon_wafers_stock -> run thrust_controller_surface
;recipe__water_recycler run life_support_gas_stock -> run water_recycler_surface
;recipe__water_synthesis run lunar_hydrogen_stock*2 lunar_oxygen_stock -> run water_surface
;recipe__windows run glass_panels_stock -> run windows_surface
;recipe__wiring_harness run carbon_fiber_stock -> run wiring_harness_surface

## Purges (post-launch)
;drain__air_filtration_surface done air_filtration_surface -> done
;drain__air_filtration_bus done air_filtration_bus -> done
;drain__air_filtration_stock done air_filtration_stock -> done
;drain__aluminum_ingots_surface done aluminum_ingots_surface -> done
;drain__aluminum_ingots_bus done aluminum_ingots_bus -> done
;drain__aluminum_ingots_stock done aluminum_ingots_stock -> done
;drain__aluminum_oxide_surface done aluminum_oxide_surface -> done
;drain__aluminum_oxide_bus done aluminum_oxide_bus -> done
;drain__aluminum_oxide_stock done aluminum_oxide_stock -> done
;drain__ammonia_surface done ammonia_surface -> done
;drain__ammonia_bus done ammonia_bus -> done
;drain__ammonia_stock done ammonia_stock -> done
;drain__carbon_dioxide_surface done carbon_dioxide_surface -> done
;drain__carbon_dioxide_bus done carbon_dioxide_bus -> done
;drain__carbon_dioxide_stock done carbon_dioxide_stock -> done
;drain__carbon_fiber_surface done carbon_fiber_surface -> done
;drain__carbon_fiber_bus done carbon_fiber_bus -> done
;drain__carbon_fiber_stock done carbon_fiber_stock -> done
;drain__cargo_container_surface done cargo_container_surface -> done
;drain__cargo_container_bus done cargo_container_bus -> done
;drain__cargo_container_stock done cargo_container_stock -> done
;drain__ceramic_plates_surface done ceramic_plates_surface -> done
;drain__ceramic_plates_bus done ceramic_plates_bus -> done
;drain__ceramic_plates_stock done ceramic_plates_stock -> done
;drain__combustion_chamber_surface done combustion_chamber_surface -> done
;drain__combustion_chamber_bus done combustion_chamber_bus -> done
;drain__combustion_chamber_stock done combustion_chamber_stock -> done
;drain__communication_antenna_surface done communication_antenna_surface -> done
;drain__communication_antenna_bus done communication_antenna_bus -> done
;drain__communication_antenna_stock done communication_antenna_stock -> done
;drain__crew_module_surface done crew_module_surface -> done
;drain__crew_module_bus done crew_module_bus -> done
;drain__crew_module_stock done crew_module_stock -> done
;drain__emergency_system_surface done emergency_system_surface -> done
;drain__emergency_system_bus done emergency_system_bus -> done
;drain__emergency_system_stock done emergency_system_stock -> done
;drain__escape_rocket_surface done escape_rocket_surface -> done
;drain__escape_rocket_bus done escape_rocket_bus -> done
;drain__escape_rocket_stock done escape_rocket_stock -> done
;drain__fertilizer_pellets_surface done fertilizer_pellets_surface -> done
;drain__fertilizer_pellets_bus done fertilizer_pellets_bus -> done
;drain__fertilizer_pellets_stock done fertilizer_pellets_stock -> done
;drain__flight_computer_surface done flight_computer_surface -> done
;drain__flight_computer_bus done flight_computer_bus -> done
;drain__flight_computer_stock done flight_computer_stock -> done
;drain__fuel_injector_surface done fuel_injector_surface -> done
;drain__fuel_injector_bus done fuel_injector_bus -> done
;drain__fuel_injector_stock done fuel_injector_stock -> done
;drain__fuel_pump_surface done fuel_pump_surface -> done
;drain__fuel_pump_bus done fuel_pump_bus -> done
;drain__fuel_pump_stock done fuel_pump_stock -> done
;drain__fuel_tank_surface done fuel_tank_surface -> done
;drain__fuel_tank_bus done fuel_tank_bus -> done
;drain__fuel_tank_stock done fuel_tank_stock -> done
;drain__fuel_valve_surface done fuel_valve_surface -> done
;drain__fuel_valve_bus done fuel_valve_bus -> done
;drain__fuel_valve_stock done fuel_valve_stock -> done
;drain__glass_panels_surface done glass_panels_surface -> done
;drain__glass_panels_bus done glass_panels_bus -> done
;drain__glass_panels_stock done glass_panels_stock -> done
;drain__graphite_surface done graphite_surface -> done
;drain__graphite_bus done graphite_bus -> done
;drain__graphite_stock done graphite_stock -> done
;drain__hatch_doors_surface done hatch_doors_surface -> done
;drain__hatch_doors_bus done hatch_doors_bus -> done
;drain__hatch_doors_stock done hatch_doors_stock -> done
;drain__heat_shield_surface done heat_shield_surface -> done
;drain__heat_shield_bus done heat_shield_bus -> done
;drain__heat_shield_stock done heat_shield_stock -> done
;drain__hydrogen_fuel_surface done hydrogen_fuel_surface -> done
;drain__hydrogen_fuel_bus done hydrogen_fuel_bus -> done
;drain__hydrogen_fuel_stock done hydrogen_fuel_stock -> done
;drain__instrumentation_surface done instrumentation_surface -> done
;drain__instrumentation_bus done instrumentation_bus -> done
;drain__instrumentation_stock done instrumentation_stock -> done
;drain__iron_bars_surface done iron_bars_surface -> done
;drain__iron_bars_bus done iron_bars_bus -> done
;drain__iron_bars_stock done iron_bars_stock -> done
;drain__iron_oxide_surface done iron_oxide_surface -> done
;drain__iron_oxide_bus done iron_oxide_bus -> done
;drain__iron_oxide_stock done iron_oxide_stock -> done
;drain__landing_gear_surface done landing_gear_surface -> done
;drain__landing_gear_bus done landing_gear_bus -> done
;drain__landing_gear_stock done landing_gear_stock -> done
;drain__launch_adapter_surface done launch_adapter_surface -> done
;drain__launch_adapter_bus done launch_adapter_bus -> done
;drain__launch_adapter_stock done launch_adapter_stock -> done
;drain__life_support_gas_surface done life_support_gas_surface -> done
;drain__life_support_gas_bus done life_support_gas_bus -> done
;drain__life_support_gas_stock done life_support_gas_stock -> done
;drain__life_support_tank_surface done life_support_tank_surface -> done
;drain__life_support_tank_bus done life_support_tank_bus -> done
;drain__life_support_tank_stock done life_support_tank_stock -> done
;drain__liquid_oxygen_surface done liquid_oxygen_surface -> done
;drain__liquid_oxygen_bus done liquid_oxygen_bus -> done
;drain__liquid_oxygen_stock done liquid_oxygen_stock -> done
;drain__lunar_helium3_surface done lunar_helium3_surface -> done
;drain__lunar_helium3_bus done lunar_helium3_bus -> done
;drain__lunar_helium3_stock done lunar_helium3_stock -> done
;drain__lunar_hydrogen_surface done lunar_hydrogen_surface -> done
;drain__lunar_hydrogen_bus done lunar_hydrogen_bus -> done
;drain__lunar_hydrogen_stock done lunar_hydrogen_stock -> done
;drain__lunar_oxygen_surface done lunar_oxygen_surface -> done
;drain__lunar_oxygen_bus done lunar_oxygen_bus -> done
;drain__lunar_oxygen_stock done lunar_oxygen_stock -> done
;drain__lunar_regolith_surface done lunar_regolith_surface -> done
;drain__lunar_regolith_bus done lunar_regolith_bus -> done
;drain__lunar_regolith_stock done lunar_regolith_stock -> done
;drain__methane_surface done methane_surface -> done
;drain__methane_bus done methane_bus -> done
;drain__methane_stock done methane_stock -> done
;drain__navigation_system_surface done navigation_system_surface -> done
;drain__navigation_system_bus done navigation_system_bus -> done
;drain__navigation_system_stock done navigation_system_stock -> done
;drain__nitrogen_fertilizer_surface done nitrogen_fertilizer_surface -> done
;drain__nitrogen_fertilizer_bus done nitrogen_fertilizer_bus -> done
;drain__nitrogen_fertilizer_stock done nitrogen_fertilizer_stock -> done
;drain__nitrogen_gas_surface done nitrogen_gas_surface -> done
;drain__nitrogen_gas_bus done nitrogen_gas_bus -> done
;drain__nitrogen_gas_stock done nitrogen_gas_stock -> done
;drain__nozzle_surface done nozzle_surface -> done
;drain__nozzle_bus done nozzle_bus -> done
;drain__nozzle_stock done nozzle_stock -> done
;drain__oxidizer_pump_surface done oxidizer_pump_surface -> done
;drain__oxidizer_pump_bus done oxidizer_pump_bus -> done
;drain__oxidizer_pump_stock done oxidizer_pump_stock -> done
;drain__oxidizer_tank_surface done oxidizer_tank_surface -> done
;drain__oxidizer_tank_bus done oxidizer_tank_bus -> done
;drain__oxidizer_tank_stock done oxidizer_tank_stock -> done
;drain__oxidizer_valve_surface done oxidizer_valve_surface -> done
;drain__oxidizer_valve_bus done oxidizer_valve_bus -> done
;drain__oxidizer_valve_stock done oxidizer_valve_stock -> done
;drain__polymer_plastic_surface done polymer_plastic_surface -> done
;drain__polymer_plastic_bus done polymer_plastic_bus -> done
;drain__polymer_plastic_stock done polymer_plastic_stock -> done
;drain__power_batteries_surface done power_batteries_surface -> done
;drain__power_batteries_bus done power_batteries_bus -> done
;drain__power_batteries_stock done power_batteries_stock -> done
;drain__rocket_fuel_surface done rocket_fuel_surface -> done
;drain__rocket_fuel_bus done rocket_fuel_bus -> done
;drain__rocket_fuel_stock done rocket_fuel_stock -> done
;drain__rocket_ready_surface done rocket_ready_surface -> done
;drain__rocket_ready_bus done rocket_ready_bus -> done
;drain__rocket_ready_stock done rocket_ready_stock -> done
;drain__seals_gaskets_surface done seals_gaskets_surface -> done
;drain__seals_gaskets_bus done seals_gaskets_bus -> done
;drain__seals_gaskets_stock done seals_gaskets_stock -> done
;drain__silicon_dioxide_surface done silicon_dioxide_surface -> done
;drain__silicon_dioxide_bus done silicon_dioxide_bus -> done
;drain__silicon_dioxide_stock done silicon_dioxide_stock -> done
;drain__silicon_wafers_surface done silicon_wafers_surface -> done
;drain__silicon_wafers_bus done silicon_wafers_bus -> done
;drain__silicon_wafers_stock done silicon_wafers_stock -> done
;drain__solar_panels_surface done solar_panels_surface -> done
;drain__solar_panels_bus done solar_panels_bus -> done
;drain__solar_panels_stock done solar_panels_stock -> done
;drain__steel_bars_surface done steel_bars_surface -> done
;drain__steel_bars_bus done steel_bars_bus -> done
;drain__steel_bars_stock done steel_bars_stock -> done
;drain__structural_frame_surface done structural_frame_surface -> done
;drain__structural_frame_bus done structural_frame_bus -> done
;drain__structural_frame_stock done structural_frame_stock -> done
;drain__synthetic_methane_surface done synthetic_methane_surface -> done
;drain__synthetic_methane_bus done synthetic_methane_bus -> done
;drain__synthetic_methane_stock done synthetic_methane_stock -> done
;drain__thermal_control_surface done thermal_control_surface -> done
;drain__thermal_control_bus done thermal_control_bus -> done
;drain__thermal_control_stock done thermal_control_stock -> done
;drain__thrust_controller_surface done thrust_controller_surface -> done
;drain__thrust_controller_bus done thrust_controller_bus -> done
;drain__thrust_controller_stock done thrust_controller_stock -> done
;drain__water_surface done water_surface -> done
;drain__water_bus done water_bus -> done
;drain__water_stock done water_stock -> done
;drain__water_recycler_surface done water_recycler_surface -> done
;drain__water_recycler_bus done water_recycler_bus -> done
;drain__water_recycler_stock done water_recycler_stock -> done
;drain__windows_surface done windows_surface -> done
;drain__windows_bus done windows_bus -> done
;drain__windows_stock done windows_stock -> done
;drain__wiring_harness_surface done wiring_harness_surface -> done
;drain__wiring_harness_bus done wiring_harness_bus -> done
;drain__wiring_harness_stock done wiring_harness_stock -> done

;terminate done run -> ()

