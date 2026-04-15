# Réseau de Pétri : Chimie Lunaire

## Vue d'ensemble
Système de traitement en 4 niveaux pour extraire et transformer les ressources lunaires en composants de fusée.

### Places par Niveau
- **Niveau 0 (4)** : Ressources brutes lunaires (extraites de la surface)
- **Niveau 1 (8)** : Composés chimiques de base (traitement simple)
- **Niveau 2 (16)** : Matériaux intermédiaires (synthèse complexe)
- **Niveau 3 (32)** : Composants avancés de fusée (assemblage final)

### Flux
Extraction → Traitement de base → Synthèse complexe → Assemblage de composants → Construction de fusée → Décollage

---

## Metadata (descriptif)
Ces lignes enrichissent le réseau (places/transitions/arcs) sans affecter la simulation.

### Places
@place start | {"name_fr":"Démarrage","kind":"control"}
@place run | {"name_fr":"Exécution","kind":"control"}
@place done | {"name_fr":"Terminé","kind":"control"}
@place air_filtration | {"tier":3,"name_fr":"Filtration d'air"}
@place aluminum_ingots | {"tier":2,"name_fr":"Lingots d'aluminium"}
@place aluminum_oxide | {"tier":1,"name_fr":"Oxyde d'aluminium"}
@place ammonia | {"tier":1,"name_fr":"Ammoniac"}
@place carbon_dioxide | {"tier":1,"name_fr":"Dioxyde de carbone"}
@place carbon_fiber | {"tier":3,"name_fr":"Fibre de carbone"}
@place cargo_container | {"tier":3,"name_fr":"Conteneur cargo"}
@place ceramic_plates | {"tier":2,"name_fr":"Plaques céramiques"}
@place combustion_chamber | {"tier":3,"name_fr":"Chambre de combustion"}
@place communication_antenna | {"tier":3,"name_fr":"Antenne de communication"}
@place crew_module | {"tier":3,"name_fr":"Module équipage"}
@place emergency_system | {"tier":3,"name_fr":"Système d'urgence"}
@place escape_rocket | {"tier":3,"name_fr":"Fusée de sauvetage"}
@place fertilizer_pellets | {"tier":3,"name_fr":"Pellets d'engrais"}
@place flight_computer | {"tier":3,"name_fr":"Ordinateur de bord"}
@place fuel_injector | {"tier":3,"name_fr":"Injecteur de carburant"}
@place fuel_pump | {"tier":3,"name_fr":"Pompe à carburant"}
@place fuel_tank | {"tier":3,"name_fr":"Réservoir de carburant"}
@place fuel_valve | {"tier":3,"name_fr":"Valve de carburant"}
@place glass_panels | {"tier":3,"name_fr":"Panneaux de verre"}
@place graphite | {"tier":2,"name_fr":"Graphite"}
@place hatch_doors | {"tier":3,"name_fr":"Portes d'écoutille"}
@place heat_shield | {"tier":3,"name_fr":"Bouclier thermique"}
@place hydrogen_fuel | {"tier":2,"name_fr":"Carburant hydrogène"}
@place instrumentation | {"tier":3,"name_fr":"Instrumentation"}
@place iron_bars | {"tier":2,"name_fr":"Barres de fer"}
@place iron_oxide | {"tier":1,"name_fr":"Oxyde de fer"}
@place landing_gear | {"tier":3,"name_fr":"Train d'atterrissage"}
@place launch_adapter | {"tier":3,"name_fr":"Adaptateur de lancement"}
@place life_support_gas | {"tier":3,"name_fr":"Gaz de support vie"}
@place life_support_tank | {"tier":3,"name_fr":"Réservoir support vie"}
@place liquid_oxygen | {"tier":2,"name_fr":"Oxygène liquide"}
@place lunar_helium3 | {"tier":0,"name_fr":"Hélium-3 lunaire"}
@place lunar_hydrogen | {"tier":0,"name_fr":"Hydrogène lunaire"}
@place lunar_oxygen | {"tier":0,"name_fr":"Oxygène lunaire"}
@place lunar_regolith | {"tier":0,"name_fr":"Régolithe lunaire"}
@place methane | {"tier":1,"name_fr":"Méthane"}
@place navigation_system | {"tier":3,"name_fr":"Système de navigation"}
@place nitrogen_fertilizer | {"tier":2,"name_fr":"Engrais azoté"}
@place nitrogen_gas | {"tier":1,"name_fr":"Azote (gaz)"}
@place nozzle | {"tier":3,"name_fr":"Tuyère"}
@place oxidizer_pump | {"tier":3,"name_fr":"Pompe d'oxydant"}
@place oxidizer_tank | {"tier":3,"name_fr":"Réservoir d'oxydant"}
@place oxidizer_valve | {"tier":3,"name_fr":"Valve d'oxydant"}
@place polymer_plastic | {"tier":3,"name_fr":"Plastique polymère"}
@place power_batteries | {"tier":3,"name_fr":"Batteries"}
@place rocket_fuel | {"tier":3,"name_fr":"Propergol"}
@place rocket_ready | {"tier":3,"name_fr":"Fusée prête"}
@place seals_gaskets | {"tier":3,"name_fr":"Joints et garnitures"}
@place silicon_dioxide | {"tier":1,"name_fr":"Dioxyde de silicium"}
@place silicon_wafers | {"tier":2,"name_fr":"Wafers de silicium"}
@place solar_panels | {"tier":3,"name_fr":"Panneaux solaires"}
@place steel_bars | {"tier":3,"name_fr":"Barres d'acier"}
@place structural_frame | {"tier":3,"name_fr":"Structure principale"}
@place synthetic_methane | {"tier":2,"name_fr":"Méthane synthétique"}
@place thermal_control | {"tier":3,"name_fr":"Contrôle thermique"}
@place thrust_controller | {"tier":3,"name_fr":"Contrôleur de poussée"}
@place water | {"tier":1,"name_fr":"Eau"}
@place water_recycler | {"tier":3,"name_fr":"Recycleur d'eau"}
@place windows | {"tier":3,"name_fr":"Hublots"}
@place wiring_harness | {"tier":3,"name_fr":"Faisceau de câbles"}

### Transitions
@transition air_filtration | {"name_fr":"Filtration d'air"}
@transition aluminum_ingots | {"name_fr":"Réduction"}
@transition aluminum_oxide | {"name_fr":"Oxydation du régolithe"}
@transition ammonia_synthesis | {"name_fr":"Synthèse d'ammoniac"}
@transition assemble_rocket | {"name_fr":"Assemblage complet"}
@transition carbon_dioxide | {"name_fr":"Synthèse de CO2"}
@transition carbon_fiber | {"name_fr":"Composite"}
@transition cargo_container | {"name_fr":"Conteneur cargo"}
@transition ceramic_plates | {"name_fr":"Céramique"}
@transition combustion_chamber | {"name_fr":"Chambre de combustion"}
@transition communication_antenna | {"name_fr":"Antenne de communication"}
@transition crew_module | {"name_fr":"Module équipage"}
@transition emergency_system | {"name_fr":"Système d'urgence"}
@transition escape_rocket | {"name_fr":"Fusée de sauvetage"}
@transition fertilizer_pellets | {"name_fr":"Granulation"}
@transition flight_computer | {"name_fr":"Ordinateur de bord"}
@transition fuel_injector | {"name_fr":"Injecteur carburant"}
@transition fuel_pump | {"name_fr":"Pompe carburant"}
@transition fuel_tank | {"name_fr":"Réservoir de carburant"}
@transition fuel_valve | {"name_fr":"Valve carburant"}
@transition glass_panels | {"name_fr":"Fabrication"}
@transition graphite | {"name_fr":"Extraction carbone"}
@transition hatch_doors | {"name_fr":"Porte d'écoutille"}
@transition heat_shield | {"name_fr":"Bouclier thermique"}
@transition hydrogen_fuel | {"name_fr":"Traitement de l'eau"}
@transition init | {"name_fr":"Initialisation"}
@transition instrumentation | {"name_fr":"Instrumentation"}
@transition iron_bars | {"name_fr":"Réduction"}
@transition iron_oxide | {"name_fr":"Oxydation du régolithe"}
@transition landing_gear | {"name_fr":"Train d'atterrissage"}
@transition launch | {"name_fr":"Décollage"}
@transition launch_adapter | {"name_fr":"Adaptateur de lancement"}
@transition life_support_gas | {"name_fr":"Gaz support vie"}
@transition life_support_tank | {"name_fr":"Réservoir support vie"}
@transition liquid_oxygen | {"name_fr":"Traitement de l'eau"}
@transition lunar_helium3_extraction | {"name_fr":"Extrait l'hélium-3 présent dans le régolithe lunaire (potentiel pour fusion nucléaire future)"}
@transition lunar_hydrogen_extraction | {"name_fr":"Extrait l'hydrogène lunaire présent dans le régolithe (composant essentiel pour l'eau et le carburant)"}
@transition lunar_oxygen_extraction | {"name_fr":"Extrait l'oxygène lunaire présent dans les oxydes minéraux (essentiel pour la vie et l'oxydant)"}
@transition lunar_regolith_extraction | {"name_fr":"Extrait le régolithe lunaire (poussière et roche de surface, base pour matériaux de construction)"}
@transition methane_synthesis | {"name_fr":"Synthèse de méthane"}
@transition navigation_system | {"name_fr":"Système de navigation"}
@transition nitrogen_fertilizer | {"name_fr":"Traitement"}
@transition nitrogen_gas | {"name_fr":"Synthèse d'azote moléculaire"}
@transition nozzle | {"name_fr":"Tuyère"}
@transition oxidizer_pump | {"name_fr":"Pompe oxydant"}
@transition oxidizer_tank | {"name_fr":"Réservoir d'oxydant"}
@transition oxidizer_valve | {"name_fr":"Valve oxydant"}
@transition polymer_plastic | {"name_fr":"Polymérisation"}
@transition power_batteries | {"name_fr":"Batteries principales"}
@transition rocket_fuel | {"name_fr":"Propergol"}
@transition seals_gaskets | {"name_fr":"Joints et garnitures"}
@transition silicon_dioxide | {"name_fr":"Oxydation du régolithe"}
@transition silicon_wafers | {"name_fr":"Purification"}
@transition solar_panels | {"name_fr":"Panneaux solaires"}
@transition steel_bars | {"name_fr":"Alliage"}
@transition structural_frame | {"name_fr":"Structure principale"}
@transition synthetic_methane | {"name_fr":"Raffinage"}
@transition terminate | {"name_fr":"Terminaison"}
@transition thermal_control | {"name_fr":"Contrôle thermique"}
@transition thrust_controller | {"name_fr":"Contrôleur de poussée"}
@transition water_recycler | {"name_fr":"Recyclage d'eau"}
@transition water_synthesis | {"name_fr":"Synthèse d'eau"}
@transition windows | {"name_fr":"Hublots"}
@transition wiring_harness | {"name_fr":"Câblage électrique"}

---

## Niveau 0 : Ressources Brutes Lunaires
Transitions d'extraction (tier 0) qui nécessitent le token `run` (démarrage via `init`).

;init start -> run

;lunar_hydrogen_extraction run -> run lunar_hydrogen
# Extrait l'hydrogène lunaire présent dans le régolithe (composant essentiel pour l'eau et le carburant)

;lunar_oxygen_extraction run -> run lunar_oxygen
# Extrait l'oxygène lunaire présent dans les oxydes minéraux (essentiel pour la vie et l'oxydant)

;lunar_helium3_extraction run -> run lunar_helium3
# Extrait l'hélium-3 présent dans le régolithe lunaire (potentiel pour fusion nucléaire future)

;lunar_regolith_extraction run -> run lunar_regolith
# Extrait le régolithe lunaire (poussière et roche de surface, base pour matériaux de construction)

---

## Niveau 1 : Composés Chimiques de Base
Traitement simple des matières premières en composés chimiques fondamentaux

@transition water_synthesis | {"name_fr":"Synthèse d'eau"}
@arc water_synthesis in lunar_hydrogen | {"role":"réactif"}
@arc water_synthesis in lunar_oxygen | {"role":"réactif"}
@arc water_synthesis out water | {"role":"produit"}

;water_synthesis lunar_hydrogen*2 lunar_oxygen -> water
# Synthèse d'eau : 2 hydrogène + 1 oxygène (pour vie, recyclage et traitement carburant)

;methane_synthesis lunar_hydrogen*4 lunar_oxygen -> methane
# Synthèse de méthane : 4 hydrogène + 1 oxygène (carburant de base pour polymères)

;ammonia_synthesis lunar_hydrogen*3 lunar_oxygen*2 -> ammonia
# Synthèse d'ammoniac : 3 hydrogène + 2 oxygène (engrais azoté pour systèmes agricoles)

;silicon_dioxide lunar_regolith -> silicon_dioxide
# Oxydation du régolithe : extraction de dioxyde de silicium (base pour wafers et verre)

;iron_oxide lunar_regolith -> iron_oxide
# Oxydation du régolithe : extraction d'oxyde de fer (base pour acier et structures)

;aluminum_oxide lunar_regolith -> aluminum_oxide
# Oxydation du régolithe : extraction d'oxyde d'aluminium (base pour aluminium et céramique)

;carbon_dioxide lunar_hydrogen lunar_oxygen -> carbon_dioxide
# Synthèse de CO2 : 1 hydrogène + 1 oxygène (base pour graphite et systèmes de support vie)

;nitrogen_gas lunar_oxygen*3 -> nitrogen_gas
# Synthèse d'azote moléculaire : 3 oxygène transformés (composant pour fibres carbone et engrais)

---

## Niveau 2 : Matériaux Intermédiaires
Synthèse complexe combinant les composés de base en matériaux utilisables

;hydrogen_fuel water -> hydrogen_fuel
# Traitement de l'eau : production de carburant hydrogène (composant du propergol)

;liquid_oxygen water -> liquid_oxygen
# Traitement de l'eau : production d'oxygène liquide (oxydant cryogénique)

;synthetic_methane water methane -> synthetic_methane
# Raffinage : méthane synthétique purifié (base pour plastiques polymères)

;nitrogen_fertilizer water ammonia -> nitrogen_fertilizer
# Traitement : engrais azoté concentré (pour systèmes agricoles en serre)

;silicon_wafers silicon_dioxide -> silicon_wafers
# Purification : wafers de silicium pour électronique et panneaux solaires

;iron_bars iron_oxide -> iron_bars
# Réduction : barres de fer pur (matériau de base pour structures métalliques)

;aluminum_ingots aluminum_oxide -> aluminum_ingots
# Réduction : lingots d'aluminium pur (léger, pour structures et batteries)

;graphite carbon_dioxide -> graphite
# Extraction carbone : graphite pur (composant pour batteries et composites)

;steel_bars iron_bars aluminum_ingots -> steel_bars
# Alliage : acier renforcé aluminium (structures principales de fusée)

;glass_panels silicon_wafers -> glass_panels
# Fabrication : panneaux de verre transparent (hublots et vitres)

;ceramic_plates aluminum_oxide iron_oxide -> ceramic_plates
# Céramique : plaques de protection thermique (bouclier thermique)

;carbon_fiber graphite nitrogen_gas -> carbon_fiber
# Composite : fibre de carbone haute résistance (structures légères et câblage)

;polymer_plastic synthetic_methane -> polymer_plastic
# Polymérisation : plastique polymère (joints, gaskets et composants isolants)

;fertilizer_pellets nitrogen_fertilizer -> fertilizer_pellets
# Granulation : pellets d'engrais concentré (agriculture en serre lunaire)

;rocket_fuel hydrogen_fuel liquid_oxygen -> rocket_fuel
# Propergol : mélange hydrogène/oxygène liquide (carburant principal de fusée)

;life_support_gas liquid_oxygen nitrogen_gas -> life_support_gas
# Gaz support vie : mélange respirable O2/N2 (systèmes de survit de l'équipage)

---

## Niveau 3 : Composants Avancés de Fusée
Assemblage des matériaux intermédiaires en composants fonctionnels de fusée

### Propulsion

;fuel_tank steel_bars -> fuel_tank
# Réservoir de carburant : structure en acier pour stockage hydrogène liquide

;fuel_pump steel_bars graphite -> fuel_pump
# Pompe carburant : système de pompage haute pression avec joints en graphite

;fuel_valve steel_bars ceramic_plates -> fuel_valve
# Valve carburant : système de contrôle de flux résistant à haute température

;fuel_injector steel_bars silicon_wafers -> fuel_injector
# Injecteur carburant : système de pulvérisation de précision avec électronique

;oxidizer_tank steel_bars -> oxidizer_tank
# Réservoir d'oxydant : structure en acier pour stockage oxygène liquide cryogénique

;oxidizer_pump steel_bars graphite -> oxidizer_pump
# Pompe oxydant : système de pompage cryogénique haute performance

;oxidizer_valve steel_bars ceramic_plates -> oxidizer_valve
# Valve oxydant : contrôle de flux cryogénique résistant au froid extrême

;combustion_chamber ceramic_plates steel_bars -> combustion_chamber
# Chambre de combustion : assemblage céramique/acier résistant aux hautes températures

;nozzle ceramic_plates steel_bars -> nozzle
# Tuyère : expansion des gaz de combustion pour poussée maximale

### Contrôle et Navigation

;thrust_controller silicon_wafers -> thrust_controller
# Contrôleur de poussée : système électronique de régulation moteur

;flight_computer silicon_wafers -> flight_computer
# Ordinateur de bord : cerveau de la fusée pour calculs de trajectoire

;navigation_system silicon_wafers carbon_fiber -> navigation_system
# Système de navigation : GPS et guidage inertiel avec antennes carbone

;communication_antenna aluminum_ingots carbon_fiber -> communication_antenna
# Antenne de communication : liaison radio Terre-Lune avec éléments carbone

### Support Vie

;life_support_tank aluminum_ingots -> life_support_tank
# Réservoir support vie : stockage gaz respirable et ressources vitales

;air_filtration life_support_gas -> air_filtration
# Filtration d'air : système de purification et recyclage de l'air

;water_recycler life_support_gas -> water_recycler
# Recyclage d'eau : récupération et purification de l'eau de condensation

;heat_shield ceramic_plates carbon_fiber -> heat_shield
# Bouclier thermique : protection céramique/carbone pour rentrée atmosphérique

;thermal_control glass_panels -> thermal_control
# Contrôle thermique : régulation de température des systèmes électroniques

### Énergie et Structures

;power_batteries aluminum_ingots -> power_batteries
# Batteries principales : stockage d'énergie pour systèmes de bord

;solar_panels silicon_wafers aluminum_ingots -> solar_panels
# Panneaux solaires : production d'énergie pendant le vol et en orbite

;structural_frame steel_bars aluminum_ingots -> structural_frame
# Structure principale : armature de fusée combinant acier et aluminium

;landing_gear steel_bars -> landing_gear
# Train d'atterrissage : système de déploiement et amortisseurs pour atterrissage

;cargo_container aluminum_ingots -> cargo_container
# Conteneur cargo : espace de stockage pour équipements et échantillons

;crew_module aluminum_ingots glass_panels -> crew_module
# Module équipage : cabine pressurisée avec hublots pour astronautes

;hatch_doors aluminum_ingots ceramic_plates -> hatch_doors
# Porte d'écoutille : système d'étanchéité et verrouillage pressurisé

;windows glass_panels -> windows
# Hublots : vitres renforcées pour observation et navigation visuelle

;seals_gaskets polymer_plastic -> seals_gaskets
# Joints et garnitures : étanchéité des modules pressurisés

;wiring_harness carbon_fiber -> wiring_harness
# Câblage électrique : réseau de connexion avec isolation en fibre carbone

;instrumentation silicon_wafers -> instrumentation
# Instrumentation : capteurs et instruments de mesure de vol

;emergency_system silicon_wafers -> emergency_system
# Système d'urgence : sauvegarde automatisée et alertes critiques

;escape_rocket rocket_fuel -> escape_rocket
# Fusée de sauvetage : système de propulsion d'évacuation d'urgence

;launch_adapter structural_frame -> launch_adapter
# Adaptateur de lancement : interface avec plateforme de lancement terrestre

---

## Assemblage Final : Construction de la Fusée
Les 32 composants de niveau 3 convergent vers l'assemblage final

;assemble_rocket fuel_tank fuel_pump fuel_valve fuel_injector oxidizer_tank oxidizer_pump oxidizer_valve combustion_chamber nozzle thrust_controller flight_computer navigation_system communication_antenna life_support_tank air_filtration water_recycler heat_shield thermal_control power_batteries solar_panels structural_frame landing_gear cargo_container crew_module hatch_doors windows seals_gaskets wiring_harness instrumentation emergency_system escape_rocket launch_adapter -> rocket_ready
# Assemblage complet : tous les composants sont intégrés pour former la fusée opérationnelle

;launch run rocket_ready -> done run
# Décollage : la fusée quitte la Lune, on passe en phase "post-launch" (purge)

---

## Purge (post-launch)
Drain de toutes les places vers `done` avant terminaison.

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
# Terminaison : consomme `done` + `run` et termine le système
