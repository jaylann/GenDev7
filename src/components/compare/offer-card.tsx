import React, {FC} from "react";
import {
    CalendarClock, Database, Download as DownloadIcon, DownloadCloud, Gift, ShieldCheck, Sparkles, Star, Tv2, Wifi
} from "lucide-react";
import {Badge} from "@/components/ui/badge";
import {motion} from "framer-motion";
import {Card} from "@/components/ui/card";
import {SortOptionKey} from "@/types/sort-option-key";
import {Offer} from "@/types/offer";
import {formatEur} from "@/utils/formatters";
import {ProviderLogo} from "@/components/compare/provider-logo";
import {DetailBadgeComponent, DetailBadgeInfo} from "@/components/compare/detail-badge";


interface OfferCardProps {
    offer: Offer;
    currentSortOption: SortOptionKey;
}

/**
 * Card component to display individual offer details.
 * @param offer - The Offer data object.
 * @param currentSortOption - The currently active sort option key.
 */
export const OfferCard: FC<OfferCardProps> = ({offer, currentSortOption}) => {
    const displayPriceIntro = formatEur(offer.price_cents_month_intro);
    const displayPriceRegular = offer.price_cents_month_regular != null && offer.price_cents_month_regular !== offer.price_cents_month_intro ? formatEur(offer.price_cents_month_regular) : null;
    const avgPriceDisplay = offer.effective_price_24_months != null ? formatEur(offer.effective_price_24_months) : 'N/A';

    let prominentBonusText: string | null = null;
    if ((offer.voucher_type === 'absolute' || offer.voucher_type === 'cashback') && offer.voucher_value_cents != null && offer.voucher_value_cents > 0) {
        prominentBonusText = `${formatEur(offer.voucher_value_cents)} ${offer.voucher_type === 'cashback' ? 'Cashback' : 'Bonus'}`;
    }

    const badgeColors = {
        tv: {bg: "bg-purple-600/20", text: "text-purple-300", border: "border-purple-500/50", icon: "text-purple-400"},
        install: {bg: "bg-sky-600/20", text: "text-sky-300", border: "border-sky-500/50", icon: "text-sky-400"},
        dataCap: {bg: "bg-amber-600/20", text: "text-amber-300", border: "border-amber-500/50", icon: "text-amber-400"},
        youth: {bg: "bg-teal-600/20", text: "text-teal-300", border: "border-teal-500/50", icon: "text-teal-400"},
        discount: {bg: "bg-pink-600/20", text: "text-pink-300", border: "border-pink-500/50", icon: "text-pink-400"},
        recommend: {
            bg: "bg-yellow-500/20", text: "text-yellow-300", border: "border-yellow-500/50", icon: "text-yellow-400"
        }
    };
    const detailBadges: DetailBadgeInfo[] = [];

    if (currentSortOption === 'recommended' && offer.recommendation_score != null) {
        detailBadges.push({
            key: 'reco',
            icon: Star,
            text: `Score: ${offer.recommendation_score.toFixed(2)}`,
            colorConfig: badgeColors.recommend
        });
    }
    if (offer.tv_included) {
        let tvText = "TV Incl.";
        if (offer.tv_package_name) tvText = `TV (${offer.tv_package_name.length > 10 ? offer.tv_package_name.substring(0, 8) + '...' : offer.tv_package_name})`;
        detailBadges.push({key: 'tv', icon: Tv2, text: tvText, colorConfig: badgeColors.tv});
    }
    if (offer.installation_service_included != null) {
        let installText = offer.installation_service_included ? "Install Incl." : (offer.installation_cost_cents ?? 0) > 0 ? `Install: ${formatEur(offer.installation_cost_cents)}` : "Install Opt.";
        detailBadges.push({key: 'install', icon: DownloadCloud, text: installText, colorConfig: badgeColors.install});
    }
    if (offer.data_cap_gb != null) {
        detailBadges.push({
            key: 'dataCap', icon: Database, text: `${offer.data_cap_gb} GB Cap`, colorConfig: badgeColors.dataCap
        });
    }
    if (offer.max_age != null) {
        detailBadges.push({
            key: 'youth', icon: ShieldCheck, text: `Youth (≤${offer.max_age}y)`, colorConfig: badgeColors.youth
        });
    }
    if (!prominentBonusText && offer.voucher_type === 'percentage' && offer.voucher_value_percent != null && offer.voucher_value_percent > 0) {
        detailBadges.push({
            key: 'discount', icon: Gift, text: `${offer.voucher_value_percent}% Off`, colorConfig: badgeColors.discount
        });
    }


    return (<motion.div layout initial={{opacity: 0, y: 15, scale: 0.98}} animate={{opacity: 1, y: 0, scale: 1}}
                        exit={{opacity: 0, y: -10, scale: 0.98}} transition={{duration: 0.25, ease: "circOut"}}
                        className="h-full">
        <Card
            className="h-full py-2 bg-[#1C203C] border border-[#303558]/80 text-slate-300 flex flex-col rounded-lg shadow-lg hover:border-indigo-600/70 transition-colors duration-200 group data-[selected=true]:border-indigo-500 data-[selected=true]:ring-2 data-[selected=true]:ring-indigo-500">
            <div className="p-4 flex items-center gap-2.5 border-b border-[#303558]/80">
                <ProviderLogo providerName={offer.provider}
                              className="!size-8 bg-slate-700 group-hover:bg-indigo-700 p-1"/>
                <div>
                    <h3 className="text-[0.9rem] font-semibold text-white group-hover:text-indigo-300 transition-colors leading-tight">{offer.provider}</h3>
                    <p className="text-[0.7rem] text-slate-400 truncate leading-tight max-w-[180px] xs:max-w-[200px]"
                       title={offer.plan_name}>{offer.plan_name}</p>
                </div>
                <div className="ml-auto text-right">
                    <p className="text-[0.65rem] text-slate-400">Avg./mo (24m)</p>
                    <p className="text-sm font-semibold text-indigo-300">{avgPriceDisplay}</p>
                </div>
            </div>
            <div className="p-4 pt-0 flex-grow flex flex-col justify-between">
                <div>
                    <div className="text-center mb-3">
                        <div
                            className="flex items-center justify-center text-[0.65rem] text-indigo-300 mb-0.5 font-medium">
                            <DownloadIcon size={14} className="mr-1 text-indigo-400"/> Download
                        </div>
                        <p className="text-4xl font-bold text-white leading-none">{offer.speed_down_mbit}</p>
                        <p className="text-xs text-slate-400">Mbps</p>
                    </div>
                    <div className="space-y-1.5 mb-3">
                        <div>
                            <span className="text-[0.7rem] text-slate-400 block mb-0">Intro Price:</span>
                            <p className="text-xl font-semibold text-white leading-tight">
                                {displayPriceIntro} <span
                                className="text-base font-normal text-slate-400">/mo</span>
                            </p>
                            <p className="text-[0.65rem] text-slate-500 leading-tight">first {offer.contract_duration_months} months</p>
                        </div>
                        {displayPriceRegular && (<div>
                            <span className="text-[0.7rem] text-slate-400 block mb-0">Regular:</span>
                            <p className="text-lg font-medium text-slate-300 leading-tight">
                                {displayPriceRegular} <span
                                className="text-sm font-normal text-slate-400">/mo</span>
                            </p>
                        </div>)}
                    </div>
                    <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-1.5">
                            <CalendarClock size={13} className="text-slate-500 shrink-0"/>
                            <span className="text-slate-400">Contract:</span>
                            <span
                                className="font-medium text-slate-200">{offer.contract_duration_months} months</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Wifi size={13} className="text-slate-500 shrink-0"/>
                            <span className="text-slate-400">Type:</span>
                            <span className="font-medium text-slate-200">{offer.connection_type}</span>
                        </div>
                    </div>
                </div>
                {(prominentBonusText || detailBadges.length > 0) && (
                    <div className="mt-3 pt-3 border-t border-[#303558]/80 space-y-2">
                        {prominentBonusText && (<Badge variant="default"
                                                       className="w-full justify-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold py-1.5 rounded-md leading-tight">
                            <Sparkles size={14}/> {prominentBonusText}
                        </Badge>)}
                        {detailBadges.length > 0 && (<div className="flex flex-wrap gap-1.5 justify-center">
                            {detailBadges.map(badgeInfo => <DetailBadgeComponent {...badgeInfo} />)}
                        </div>)}
                    </div>)}
            </div>
        </Card>
    </motion.div>);
};