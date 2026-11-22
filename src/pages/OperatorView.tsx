import { OperatorViewSection } from '../components/OperatorViewSection';
import { useTransitApp } from '../context/TransitAppContext';
import { formatHour } from '../utils/transitUtils';

export function OperatorView() {
  const {
    dayType,
    departureHour,
    setDayType,
    setDepartureTime,
    handleSelectCorridor,
  } = useTransitApp();

  return (
    <OperatorViewSection
      standalonePage
      dayType={dayType}
      selectedHour={departureHour}
      onChangeDayType={setDayType}
      onSelectHour={(h) => setDepartureTime(formatHour(h))}
      onPlanCorridor={(o, d, h) => handleSelectCorridor(o, d, h)}
    />
  );
}
