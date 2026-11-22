import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMap } from '@vis.gl/react-google-maps';
import { LatLngPoint } from '../types/transit';

interface GoogleMapOverlayProps {
  position: LatLngPoint;
  pane?: 'overlayMouseTarget' | 'floatPane';
  zIndex?: number;
  offsetY?: number;
  children: ReactNode;
}

export function GoogleMapOverlay({
  position,
  pane = 'floatPane',
  zIndex = 30,
  offsetY = 0,
  children,
}: GoogleMapOverlayProps) {
  const map = useMap();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps?.OverlayView) return;

    const div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.transform = `translate(-50%, calc(-50% + ${offsetY}px))`;
    div.style.zIndex = String(zIndex);
    if (pane === 'floatPane') {
      div.style.pointerEvents = 'none';
    } else {
      google.maps.OverlayView.preventMapHitsFrom(div);
    }

    class ReactMapOverlay extends google.maps.OverlayView {
      onAdd() {
        const panes = this.getPanes();
        const target = panes?.[pane];
        if (target) {
          target.appendChild(div);
        }
        setContainer(div);
      }

      draw() {
        const projection = this.getProjection();
        if (!projection) return;
        const point = projection.fromLatLngToDivPixel(
          new google.maps.LatLng(position.lat, position.lng)
        );
        if (point) {
          div.style.left = `${point.x}px`;
          div.style.top = `${point.y}px`;
        }
      }

      onRemove() {
        setContainer(null);
        if (div.parentNode) {
          div.parentNode.removeChild(div);
        }
      }
    }

    const overlay = new ReactMapOverlay();
    overlay.setMap(map);

    return () => {
      overlay.setMap(null);
    };
  }, [map, pane, zIndex, offsetY, position.lat, position.lng]);

  if (!container) return null;
  return createPortal(children, container);
}
