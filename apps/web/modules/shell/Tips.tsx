import shuffle from "lodash/shuffle";
import posthog from "posthog-js";
import { useState, memo } from "react";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { localStorage } from "@calcom/lib/webstorage";
import { Card } from "@calcom/ui/components/card";

import { GatedFeatures } from "./stores/gatedFeaturesStore";
import { useGatedFeaturesStore } from "./stores/gatedFeaturesStore";

type Tip = {
  id: number;
  thumbnailUrl: string;
  mediaLink?: string;
  title: string;
  description: string;
  href?: string;
  onClick?: () => void;
  coverPhoto?: string;
  variant?: "SidebarCard" | "NewLaunchSidebarCard";
};

function Tips() {
  const { t } = useLocale();
  const openModal = useGatedFeaturesStore((state) => state.open);

  const tips: Tip[] = [
    {
      id: 18,
      thumbnailUrl: "https://img.youtube.com/vi/J8HsK-8W39U/0.jpg",
      title: "Roles & Permissions",
      description: "Manage team access with roles & permissions",
      onClick: () => openModal(GatedFeatures.RolesAndPermissions),
    },
    {
      id: 17,
      thumbnailUrl: "https://img.youtube.com/vi/fMHW6jYPIb8/0.jpg",
      title: "Embed",
      description: "Embed your booking page on your website",
    },
    {
      id: 16,
      thumbnailUrl: "https://img.youtube.com/vi/xopxmk2H4Ng/0.jpg",
      title: "Pagos en línea",
      description: "Cobra por tus servicios con pagos en línea",
    },
    {
      id: 11,
      thumbnailUrl: "https://img.youtube.com/vi/KTg_qzA9NEc/0.jpg",
      title: "Estadísticas",
      description: "Entiende mejor tu negocio con estadísticas",
    },
    {
      id: 8,
      thumbnailUrl: "https://img.youtube.com/vi/piKlAiibAFo/0.jpg",
      title: "Automatiza flujos",
      description: "Automatiza recordatorios y tareas repetitivas",
    },
    {
      id: 6,
      thumbnailUrl: "https://img.youtube.com/vi/yGiZo1Ry5-8/0.jpg",
      title: "Citas recurrentes",
      description: "Crea citas que se repiten automáticamente",
    },
    {
      id: 4,
      thumbnailUrl: "https://img.youtube.com/vi/zGr_s-fG84k/0.jpg",
      title: "Confirmación manual",
      description: "Aprueba o rechaza citas antes de confirmarlas",
    },
    {
      id: 1,
      thumbnailUrl: "https://img.youtube.com/vi/VZ5PfQzzxBw/0.jpg",
      title: "Links de reserva dinámicos",
      description: "Comparte un link para que tus clientes reserven directamente",
    },
  ];

  const reversedTips = [...shuffle(tips).slice(0).reverse()];

  const [list, setList] = useState<Tip[]>(() => {
    if (typeof window === "undefined") {
      return reversedTips;
    }
    try {
      const removedTipsString = localStorage.getItem("removedTipsIds");
      if (removedTipsString !== null) {
        const removedTipsIds = removedTipsString.split(",").map((id) => parseInt(id, 10));
        const filteredTips = reversedTips.filter((tip) => removedTipsIds.indexOf(tip.id) === -1);
        return filteredTips;
      } else {
        return reversedTips;
      }
    } catch {
      return reversedTips;
    }
  });

  const handleRemoveItem = (id: number) => {
    setList((currentItems) => {
      const items = localStorage.getItem("removedTipsIds") || "";
      const itemToRemoveIndex = currentItems.findIndex((item) => item.id === id);

      if (itemToRemoveIndex === -1) return [...currentItems];

      localStorage.setItem(
        "removedTipsIds",
        `${currentItems[itemToRemoveIndex].id.toString()}${items.length > 0 ? `,${items}` : ""}`
      );
      currentItems.splice(itemToRemoveIndex, 1);
      return [...currentItems];
    });
  };

  const baseOriginalList = list.slice(0).reverse();
  return (
    <>
      <div
        className="hidden pb-4 pt-8 lg:grid"
        /* ref={animationRef} */
        style={{
          gridTemplateColumns: "1fr",
        }}>
        {list.map((tip) => {
          const isTopTip = baseOriginalList.indexOf(tip) === 0;
          return (
            <div
              className="relative"
              style={{
                gridRowStart: 1,
                gridColumnStart: 1,
              }}
              key={tip.id}>
              <div
                className="relative"
                style={{
                  transform: `scale(${1 - baseOriginalList.indexOf(tip) / 20})`,
                  top: -baseOriginalList.indexOf(tip) * 10,
                  opacity: `${1 - baseOriginalList.indexOf(tip) / 7}`,
                }}>
                <Card
                  variant={tip.variant ?? "SidebarCard"}
                  thumbnailUrl={tip.thumbnailUrl}
                  coverPhoto={tip.coverPhoto}
                  mediaLink={isTopTip ? tip.mediaLink : undefined}
                  mediaLinkOnClick={
                    isTopTip
                      ? () => {
                          posthog.capture("tip_video_clicked", tip);
                          if (tip.onClick) tip.onClick();
                        }
                      : undefined
                  }
                  title={t(tip.title)}
                  description={t(tip.description)}
                  learnMore={
                    isTopTip
                      ? {
                          href: tip.href,
                          text: t("learn_more"),
                          onClick: () => {
                            posthog.capture("tip_learn_more_clicked", tip);
                            if (tip.onClick) tip.onClick();
                          },
                        }
                      : undefined
                  }
                  actionButton={
                    isTopTip
                      ? {
                          onClick: () => {
                            posthog.capture("tip_dismiss_clicked", tip);
                            handleRemoveItem(tip.id);
                          },
                          child: t("dismiss"),
                        }
                      : undefined
                  }
                  containerProps={{
                    tabIndex: isTopTip ? undefined : -1,
                    "aria-hidden": isTopTip ? undefined : "true",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export default memo(Tips);
