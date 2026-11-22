import { CrowdMapSection } from '../components/CrowdMapSection';
import { RouteCorridorNavOptions, useTransitApp } from '../context/TransitAppContext';
import { formatHour } from '../utils/transitUtils';

export function CrowdMap() {
  const {
    departureHour,
    dayType,
    selectedJourney,
    focusedMapRouteCode,
    setDepartureTime,
    setDayType,
    handleSelectCorridor,
  } = useTransitApp();

  return (
    <CrowdMapSection
      standalonePage
      hour={departureHour}
      dayType={dayType}
      selectedJourney={selectedJourney}
      focusedRouteCode={focusedMapRouteCode}
      onChangeHour={(h) => setDepartureTime(formatHour(h))}
      onChangeDayType={setDayType}
      onSelectCorridor={(
        o: string,
        d: string,
        routeNav?: RouteCorridorNavOptions
      ) => handleSelectCorridor(o, d, undefined, undefined, undefined, routeNav)}
    />
  );
}
