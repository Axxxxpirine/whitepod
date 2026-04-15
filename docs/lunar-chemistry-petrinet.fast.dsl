# AUTO-GENERATED — Mauvoisin PetriNet DSL (fast)
# Source: docs/gdd/lunar-chemistry-petrinet.dsl
# Notes: transitions only (no markdown/metadata), identical weights.

;init start -> run
;lunar_hydrogen_extraction run -> run lunar_hydrogen
;lunar_oxygen_extraction run -> run lunar_oxygen
;lunar_helium3_extraction run -> run lunar_helium3
;lunar_regolith_extraction run -> run lunar_regolith
;water_synthesis lunar_hydrogen*2 lunar_oxygen -> water
;methane_synthesis lunar_hydrogen*4 lunar_oxygen -> methane
;ammonia_synthesis lunar_hydrogen*3 lunar_oxygen*2 -> ammonia
;silicon_dioxide lunar_regolith -> silicon_dioxide
;iron_oxide lunar_regolith -> iron_oxide
;aluminum_oxide lunar_regolith -> aluminum_oxide
;carbon_dioxide lunar_hydrogen lunar_oxygen -> carbon_dioxide
;nitrogen_gas lunar_oxygen*3 -> nitrogen_gas
;hydrogen_fuel water -> hydrogen_fuel
;liquid_oxygen water -> liquid_oxygen
;synthetic_methane water methane -> synthetic_methane
;nitrogen_fertilizer water ammonia -> nitrogen_fertilizer
;silicon_wafers silicon_dioxide -> silicon_wafers
;iron_bars iron_oxide -> iron_bars
;aluminum_ingots aluminum_oxide -> aluminum_ingots
;graphite carbon_dioxide -> graphite
;steel_bars iron_bars aluminum_ingots -> steel_bars
;glass_panels silicon_wafers -> glass_panels
;ceramic_plates aluminum_oxide iron_oxide -> ceramic_plates
;carbon_fiber graphite nitrogen_gas -> carbon_fiber
;polymer_plastic synthetic_methane -> polymer_plastic
;fertilizer_pellets nitrogen_fertilizer -> fertilizer_pellets
;rocket_fuel hydrogen_fuel liquid_oxygen -> rocket_fuel
;life_support_gas liquid_oxygen nitrogen_gas -> life_support_gas
;fuel_tank steel_bars -> fuel_tank
;fuel_pump steel_bars graphite -> fuel_pump
;fuel_valve steel_bars ceramic_plates -> fuel_valve
;fuel_injector steel_bars silicon_wafers -> fuel_injector
;oxidizer_tank steel_bars -> oxidizer_tank
;oxidizer_pump steel_bars graphite -> oxidizer_pump
;oxidizer_valve steel_bars ceramic_plates -> oxidizer_valve
;combustion_chamber ceramic_plates steel_bars -> combustion_chamber
;nozzle ceramic_plates steel_bars -> nozzle
;thrust_controller silicon_wafers -> thrust_controller
;flight_computer silicon_wafers -> flight_computer
;navigation_system silicon_wafers carbon_fiber -> navigation_system
;communication_antenna aluminum_ingots carbon_fiber -> communication_antenna
;life_support_tank aluminum_ingots -> life_support_tank
;air_filtration life_support_gas -> air_filtration
;water_recycler life_support_gas -> water_recycler
;heat_shield ceramic_plates carbon_fiber -> heat_shield
;thermal_control glass_panels -> thermal_control
;power_batteries aluminum_ingots -> power_batteries
;solar_panels silicon_wafers aluminum_ingots -> solar_panels
;structural_frame steel_bars aluminum_ingots -> structural_frame
;landing_gear steel_bars -> landing_gear
;cargo_container aluminum_ingots -> cargo_container
;crew_module aluminum_ingots glass_panels -> crew_module
;hatch_doors aluminum_ingots ceramic_plates -> hatch_doors
;windows glass_panels -> windows
;seals_gaskets polymer_plastic -> seals_gaskets
;wiring_harness carbon_fiber -> wiring_harness
;instrumentation silicon_wafers -> instrumentation
;emergency_system silicon_wafers -> emergency_system
;escape_rocket rocket_fuel -> escape_rocket
;launch_adapter structural_frame -> launch_adapter
;assemble_rocket fuel_tank fuel_pump fuel_valve fuel_injector oxidizer_tank oxidizer_pump oxidizer_valve combustion_chamber nozzle thrust_controller flight_computer navigation_system communication_antenna life_support_tank air_filtration water_recycler heat_shield thermal_control power_batteries solar_panels structural_frame landing_gear cargo_container crew_module hatch_doors windows seals_gaskets wiring_harness instrumentation emergency_system escape_rocket launch_adapter -> rocket_ready
;launch run rocket_ready -> done run
;drain__air_filtration done air_filtration -> done
;drain__aluminum_ingots done aluminum_ingots -> done
;drain__aluminum_oxide done aluminum_oxide -> done
;drain__ammonia done ammonia -> done
;drain__carbon_dioxide done carbon_dioxide -> done
;drain__carbon_fiber done carbon_fiber -> done
;drain__cargo_container done cargo_container -> done
;drain__ceramic_plates done ceramic_plates -> done
;drain__combustion_chamber done combustion_chamber -> done
;drain__communication_antenna done communication_antenna -> done
;drain__crew_module done crew_module -> done
;drain__emergency_system done emergency_system -> done
;drain__escape_rocket done escape_rocket -> done
;drain__fertilizer_pellets done fertilizer_pellets -> done
;drain__flight_computer done flight_computer -> done
;drain__fuel_injector done fuel_injector -> done
;drain__fuel_pump done fuel_pump -> done
;drain__fuel_tank done fuel_tank -> done
;drain__fuel_valve done fuel_valve -> done
;drain__glass_panels done glass_panels -> done
;drain__graphite done graphite -> done
;drain__hatch_doors done hatch_doors -> done
;drain__heat_shield done heat_shield -> done
;drain__hydrogen_fuel done hydrogen_fuel -> done
;drain__instrumentation done instrumentation -> done
;drain__iron_bars done iron_bars -> done
;drain__iron_oxide done iron_oxide -> done
;drain__landing_gear done landing_gear -> done
;drain__launch_adapter done launch_adapter -> done
;drain__life_support_gas done life_support_gas -> done
;drain__life_support_tank done life_support_tank -> done
;drain__liquid_oxygen done liquid_oxygen -> done
;drain__lunar_helium3 done lunar_helium3 -> done
;drain__lunar_hydrogen done lunar_hydrogen -> done
;drain__lunar_oxygen done lunar_oxygen -> done
;drain__lunar_regolith done lunar_regolith -> done
;drain__methane done methane -> done
;drain__navigation_system done navigation_system -> done
;drain__nitrogen_fertilizer done nitrogen_fertilizer -> done
;drain__nitrogen_gas done nitrogen_gas -> done
;drain__nozzle done nozzle -> done
;drain__oxidizer_pump done oxidizer_pump -> done
;drain__oxidizer_tank done oxidizer_tank -> done
;drain__oxidizer_valve done oxidizer_valve -> done
;drain__polymer_plastic done polymer_plastic -> done
;drain__power_batteries done power_batteries -> done
;drain__rocket_fuel done rocket_fuel -> done
;drain__rocket_ready done rocket_ready -> done
;drain__seals_gaskets done seals_gaskets -> done
;drain__silicon_dioxide done silicon_dioxide -> done
;drain__silicon_wafers done silicon_wafers -> done
;drain__solar_panels done solar_panels -> done
;drain__steel_bars done steel_bars -> done
;drain__structural_frame done structural_frame -> done
;drain__synthetic_methane done synthetic_methane -> done
;drain__thermal_control done thermal_control -> done
;drain__thrust_controller done thrust_controller -> done
;drain__water done water -> done
;drain__water_recycler done water_recycler -> done
;drain__windows done windows -> done
;drain__wiring_harness done wiring_harness -> done
;terminate done run -> ()
