-- DeCam GPS (Overt) · don't show speed / red-light cameras that almost certainly aren't.
--
-- 1. States that ban them by law (checked Sept 2026: GHSA counts 9 red-light bans and
--    10 speed-camera bans; lists from consumershield.com and trafficenforcementcamera.com):
--      red-light cameras banned: ID ME MS MT NH SC SD TX WV
--      speed cameras banned:     ME MS MT NH NJ SC SD TX WV WI
--    OpenStreetMap still lists hundreds there; most are traffic-signal detection cameras
--    (they tell the light a car is waiting). State shapes: US Census cartographic boundaries
--    2023 (1:5,000,000), simplified to ~400 m, stored as encoded polylines (precision 4).
-- 2. "Speed cameras" in groups of 3+ within 40 m (one per approach at an intersection)
--    anywhere: the same signal-detection pattern.
-- Such points get status 'suppressed' (hidden everywhere, like archived, but the nightly
-- OpenStreetMap import can't turn them back on). Plate readers (ALPR) are never touched.
-- 3. New issue type 'not_enforcement' ("This isn't a speed / red-light camera").

alter table public.surveillance_points drop constraint if exists surveillance_points_status_check;
alter table public.surveillance_points add constraint surveillance_points_status_check
  check (status in ('active', 'archived', 'suppressed'));
alter table public.surveillance_points add column if not exists suppressed_reason text;

create table if not exists private.camera_ban_states (
  state text primary key,
  bans  text not null,          -- 'r' red-light banned, 's' speed banned
  geom  extensions.geometry(MultiPolygon, 4326) not null
);
create index if not exists camera_ban_states_geom_idx on private.camera_ban_states using gist (geom);

create temp table ban_rings (state text, bans text, enc text) on commit drop;
insert into ban_rings values
  ('TX','rs',$p$u_nRl|a`AoK{SuFlFsL_E{AjCsCg@aDjA^hCsDzDsKcL?ildAsoRBi{ReLono@_@L}kz@~zd@?a@_Q_IsIfAsR~NqUjVgTvGkPhZwRfIqPjC^bNi\rHwCdEcIpCcT{BcGfBa^{GcHkPiBa@oEpByKYyT~H}O`EsTzGkF_CwKjC{IaSeFeGjBsMe@gHwGR{LrGi@bHeMrJ_HaCsNlFyStFm@|B|HtFcIA{H|QmEf@eKb]]lDoAt@oFxU^vQyCjBaRqEwPpAoA|ChBvAiBiDm\hGoUmDoChAoMoBkEoDi@gAmG~IgGl@{CiFmBFeDfRkTnHk[xEf@xBgCE_DiFyA~@sYdHcLpCoOjFkDQkHmEyCr@sZoRgY~CsRsAqItHaPh^uZfSeYyEiVwEqDOaOiHcHyP[cLwIwCwIxBcWfJuRAa`@rHiVdAsTuU}VgAiLdOiK|M|DjKpKvFNdP_NhGxDbOyIpFyd@iGm`@|H}HR{FtVdHtDrGpB{@LcJtLjAhD|FaCpDjFpBlJmI~@mRzQyg@mDeVcPmSmBqIkDcBcFnAcDeNwHbAcCmVwGwH}PkIyCiLhEwVhPsZhUtCrHaEzAmUqLq^xHkXxF{DxKHdQbFhGcEtDsOi@cc@_MwKaRsHxDeHmH{JvHqKPuMsWuEeFoJ]wH`LyQ|\{GnFbB~CpPbOpB~f@wSdGuItCcQqBoLiLmJoLS{PfEgE}@mDmG}AaRsI`EmElSkDaAmC}J~AuFdJcH_CyImY}VoJM_V`F{EkBiA}D|KuCuM}]Z_DzHuGn[eClUwKhGmNqBsDuHc@_CwCtBuVnDqG`ReEfBuDoCw]sC_G}MiHySkA}KqG~LiWEgXxGj@hFtLtMxInOgb@c@{[`JiErHMnHwHgDu_@bB{NnNyGnTiWrNsCjBuG{FsRcLeEiRoAuHqEg@cMbL{]eGoYgU_IuBdGkDjA_CsP_Lu@k@uN|DwM}ILdFa_@}HaK\qClEs@oEgL}HiCpEaKcAmPaPuDrTin@pIwLcBmIeJCw@uH|IsS}FsJeJtDkJ{BcAyJxE_NAiIiMyR\uPgPiVnAeXzLmEfKz@`DiCwEuQ~AuDfFmAoFkV~G_@dA}HAubA{IoBbFo[gOiE^wGyBuEsPCwPqOfNyg@x@wU`Im@~BoLxJoE}BqNbVyJv@eN}BuGlHmKeEgK|MyA`FiHnGgBd@qN|MBjLgXzJeErBaWqFkGxCwJqDaR|HG|CkDr@iItOkE}CkGp@_DvJ}@p@mMcCiSbM{D{FqL~DkJ{BsM~EaEdFPZuJpHJHcK|HwAfBcDiDgQ_GoBoCuOlOiCxKtBpAwLrIuI}AwSpCaDtMfH|C_T{I}BaC}G~G{CRcLiN_FXcJhEaEiLkJzDsGlK`FlA{MaLmHoJmP`AeL~EaK~N}JmJ}K|@m\bIuBEgCjm]_@eAyFdBsE~j@k\lGaTrHmEPiMhMwHpKeBjCyDxJ?lMwTpHkB`EoFjP~Cz_@qPlO~MzJiDzNW|Cd@g@vDbEjEzK_ArReI~KyKjDyIBkVjEqAbA{FdKtAfGxJjEGhRk]zDaA|IpC|IySzS}Cfa@nMnCgJxPoO]{LfF_CzNh@fGiFrHz@fQkCrEkFoKmUTaKdOdAbE`DzOiBdRbFtKsNnB{@dEtD`OyHdLlMlApOrItBb]q[hH|AtBbL|Q|HxJwDlTcBbP`DzEbMlShD|BjHxH`FxJ_E~YvK`EtNjQpP|Ze@vCpR~GpHhQZfB|EbLgOrFsAvFbCj`@yJtE`BtWja@jTYhMzDlQ}O|DgNdGyC~V]pSzHxi@mSzB|Ak@fDlNTrOxRxOuTzBjLxHjIxHhAjRr[hbAd_@`OvNbS~_@rHfFnK]|LkSdMm@tDoL`[_SfFEq@heBbL~y@jwB|vHt_@`}@`\~UvCx\yGvAge@}n@sTqNkCwHzAoK}DiVoD_HqGB_JmHeCoGrIcW}HmWqMqL_DnCpChLzC|AJlLkPrM}@~FnKjd@hR|vAaCnMyI`E?eK_H}H_f@c]qg@aIof@YsJbSwEQ{DdJbUho@`UzTj^lLdExK|@rPqTfHeBbCV~JvS_Bf@|GaJ|CIdCfH~HxNnGbIiClLkNh\jThH}@xJwHfEaJ|Ggl@lKtGuAjFnB|GtDh@tSed@zh@oBvPxCrQCrOfPiDhRzgArzA{LpGbCp[nVaAtVfEfMwKwV{[ya@ez@kIwF}s@eeAsK{`@}Vu@uDgFdJcOHs[rDuAfeCzwEjM|P`LbHdp@bfA`a@jc@nUfb@zR`QpCvb@lbAlhCzt@r~A`kB|}Fh^vr@pd@nu@lNhErWlYhz@fuBdeAbcBzp@|y@nkA~gAbm@|Xj]t[fj@j^x_CvgAbs@fWjcA~Wzr@~Lbr@fGby@jChv@c@tt@gE|qBqZ`{Bcj@hzBqb@njCyVbBpEo[rG_nAlJytB|^{|@~SiObNeIwAaiC~r@_x@lFsjCWafBcM_l@yHa`Bwb@onAej@kd@c]mm@kUyQ}Q_NnEoI[am@s\iSyg@eWoSg_@sQoKaLmOkB_FgDoEwRqNgDlD_OoM{TuNf@yKeRe@}a@a_AysA{Dg[qGuFcCeIoK{s@}KiCiI|JeDs@}HoQyFKc@rSbUpc@vQtj@jTnW|DzZaB~JoGdA}KxIaLcBeVhEgAhc@pOrL`KzAv_@{@tLbJrT_MvRfGz\dl@v_@xe@HnP}F|ZuFdKiUqB[xHjZvcAta@dk@|FIdHkVvDBlLwYmEmD_FdAeEiKcEa@oDwE}G}[uMaCjDyLdTjFtRwEjKhMfOfGtDpG~h@l`@vKbCvJ`Khb@`S_@vVqFaBqR`NyFhQpGb_@sH|HfDbVTtn@mEhWvGlLxJFzO{YVa`@iHcX~M~FjR\vXqNbQo_@~H_f@vr@rYjKq@hMbPj`@tLnWlCnPpHz]lCnk@`S|FpHfA`RzH`ShMzNgA|MsFfHSwKgGuDgAcKqGzAeIwJwKz@wCfHdB|FdO|MfOr[fNrN|@bPbQr@hEkEr@}[~EyWg@iMqRqj@_@kOt}@|Ix@sE~bEhQnVzBz@pFj{@aFzn@_M`NNza@}PnOj@hPwFrNvAlI}XvpBgr@|WpMdMDnFyFvJu@tNbF~MiIzFnGjTaT|Dok@vM_Av@cEiGqLb@cGzw@_CtHLbClEeGrL`Av^tEvJoA|PpA|AzFsAYnO|FhLW|NbJ~MbBgD|SuB|JhB`EtCt@nL{Fr^iQ~DoC|h@}QhD_A|FyGbAkArU}IFk@jH{JlEwQhUiHfBg@|\}DvGPx\{D`FShK}IdFdD`UW|MkGfOnGp]uDdHhExIuHtGLt\vNnEeCfRiMpEhFpEeD`HnBfMxFlJyNpRpJ|JuKxMbApPwFxHiG|FoLeF@`RlEfC_F~KgIbF_Q^FrDbGnDaB`SmN`JkIxVyGVcCpCo@xGhDdUsDlDVxIaGxIhA`JwAbH_KrD_AvGjBdP~DtCbCnKEnHyD~DuIj@}DlO}IhAkGhTsJjAeElX{PfDwDtDYxIpFdKsCxIfDnQ{M|QtB|KgM~Nv@fXkIdNdHrQ[jM_U|PuCuEeUeFqMjGqNfMmHxYiKaAyd@tEmU~LmVzDiRSeLlRoYn@cPjKeP~B{LpOGpLwGpFsUsAqJ~`@kObHsIuIiK|OkKjF`ClIuF|GmGq@kOdDuPmM{H`GkKeFiNzD_DgEwIiA{S`CoGvFsOiAqJrLxCjN{ElDqJuDiGlCKdQoFxG{LsS}Hz@mOyH}R{AmWvCyQeH}D|@{DvG^fRg[_C_NaEqFdJmM~D_FpHnC|CbAtLqHeCeDhGwF~Ai@pCnHbUwDzO{GwCcErE^rYam@~c@eA~N_WnIg@vBfFdCi@|HePvDkBvOwYIwLdN}Ex@aJmE}JvBuBzIaMfKiXiBq@jR}EzPkQvIoXxDmK~TeKbA}KzJ}J|CaN`c@AdK_JtN{A~LcYrFoApRmYdYcTkCko@dc@aGfBkNyF{HLkT`RsDaNeGoEgIla@sU`MyMyGyDTgNp]qSCNzHsGlIgC~KcZfF_UwAeMzNsYv@mKdF{@bPiKa@}OdOmO~@QlQcFrDkGa@{HzF{YoB{eA~PsH~IuG~TgElEcFd@gJpS_B`AyFeE}DToSnJFjE_Kf@mS|o@sPvEyNr`@yGfDApHkL|[kVfO{MfCyEnGeJ~@uExOPrPeEdHfB|GgRbPsEh@mEle@zAfKiI|BgSoIgb@|CwApInH`FnLy@jLvHyBtFaJnDe[kC{ClAyDvG?zUgXtIwJdKsI[yFrJiEC^lR}AjCsF`@oDpKbLr\{AhEmSvGl@fHrMbLBbZnIvKsI`I@dPhDjIsObk@dChKqEfJjAdI{FjL|CfMkAbVhDxIcL~ZvDbG_@d_@hFBtBvEc@vMaDvEr@pRwLlZiTrOxB~JuBnOyDjQkEjA|AbIcHrKk@vGlFfJYvC|MtMrFg@lh@bNeI~jAzIdBzGfOOhFyHlJjGbC`C`VtGxIyCnXdKvIxOhE|J_BvZh]tSg@xBzBmBvHhA`CpHyBlClAO|CjIdA~CyBjOhVtP[`e@vN|S}CbMbIzJj@~BrJq@pHvBfCxDmAhQtE~Ik@xF|GbKhA~GoJnAkIjIyAbIpMiEvLrPpBcAfHhBtFnFvB{DnObCzInJR`G|F`MbChFfJdHrCxEfTvFn@nJtMvWXdJvHhHe@fGj]eCl@}Fne@`FxIgE`LzEnFy@jCkJVaD`OgEw@YtOqKSn@dGpJxGsMbh@cGhCsFlJa@bI}InBqPrN{BnNgIFgJnSdBrTuHhJ`C|TgFbHyGn`@wMvPwLdH|BzEcClGmMu@yDxFsJ`h@m@rd@aE|Ci@j^cNlf@}IxJcDrN_PdNkEfVaIhMkGlGmGViOnR{KL_D|HyHdCyIvPuGt`@|CnKmMtSEbE}FnGcIbBcVxh@oJrImF`NyUbS}GeAuO|Hk`@lG{WvOoD`JyNnDqD|EwI~@wJtMqFj@qM~KsRxA_K{AyWdEwD~GaFy@oHrBsGaAiBwE{H{Ca\nEs\aDcZ|MmHf@oMzKo@bJmVfEcTb]kRzCiNdYwPmC{W|IoDkAgZtEcd@zLoTbOmBp\iFbDmWvBeFhHkGnBYpU`CjCmBvFmFD}KhU}OtH_DjZqJnCFlGoKnIdCbJcIrBdAtYaNbOfBhPqEfBmKjXoB|SmUjB_a@fv@cK|G{LfRiBdNsRpLmUzBqCrEcJrC}H~MBbH_JhCyK|d@yPvSg@bReR~D{AdF_u@zm@o@~NsLrGEzMoBtBw[rHWbIsOvT{Bbn@eMrOoAdOiRxYaExQs\jRkPzDaLrTmc@dMiZnRkSfHiJdNyInCmS`k@fIvVkPhT}GtAoI~J}@xQuFjFm@pGcKMi@zFiKhL}IeCkHdI$p$),
  ('WV','rs',$p$_ohVzbmq@e@yRaOoFsKQ}BpEwFbA_FkCPiL}IyDqSfDwLoEiOxN{QcBqHdCsRwBbGiIdBcVgUqsAxAmMaEe_@kGsF_WuGur@aG_KgQ`Cqb@qFmPeO{Au^jJwPgDyNrBwMrE_IlLmGVuHuFuLy\}HmIiNqBuSnAqTuRwXqK{K_XmRwHo@aTtTiMw@oPdDkJhc@uTpUlQxJmQiJqY{IuEsJOwIuIEgGnK{Ph@iMeGqBiPnNo^}IgSlWmFdDiKj@{AwElBePsIuPa\iAmWrF_GuJiLiEaFsTcRnAuG_G}BgX|Dsl@mk@}Fak@k~@NyKtGiMxYyJfEcJqAwPaXao@a@k`@eKuDwM}LwHk`@qj@ue@im@s}@aP{ZaAk[}RsGmWy@kFsQeDqAgOdIuH~JeGjAcS{Yo[?mMaUuH~@wKjHuG{@s@mEvEuScB{BuU`D{KgNeVb@gW{EcQxCcOmQ_VPiIkBa[yUi[_IsKoSwOwAaOkHwQ`GaP}@uH|MsFkLcS@yPcImFKuO`McT|DmYdXmGgBuPcUkBwP|EyLkNac@j|PDDsjS|`IjEl@yEkGsUg]_`@yFwSaDgEsCH_CmFyA_JdBkNyMcD{GqPeK_@kD}VaMqJmBuPiK_DxAsHaD}@aAyE_EOyJoNyGoDmETb@}W_GmEnJ_I_@gGxPg_@c@mDqMeAqE_HiCbAmBcOgSyNiAiIiVuMsC{FnBsLwBaA_E`GeFGqDsGoEy@VkG{KrBcEsB_FyQdO|FhAqHsCeHzAuFzCo@bDhG{@bLpCfE|KkLuBeMbMsDtE_RtCeB|E}S_BsStAeQzHoPkByZlDk^}AeDuG_@wCkFdA}EkE{A?kHyNfUeGv@kAwGzF_UoB}FsM|QuE~CcBcAdHua@gKzCd@uOkFhAo@wCpLet@iL}FcLaRiG~Cm@}PoJqKbG{m@rHwSjRcWnTiQZ}QcDkLpMoDaEcEwGQeCtDoAmC|GeHrCiSs@oDyHfA`Ge_@vHkA`L`Cx@jYtCnE~IuMrMa@yAcM}FsAz@eF`FElJnLzDiWqDkObAwHnKbStFyHjBfI~F_EdDpExCqFxAsS~RmJ`C`@pApHzL}DhLdIxJeXpCjHv`@lPn@tC~JTtOzLlUdFdYlMqoEhcIrMKrBdCvDaCrJfGrKmIlQxMrBoO`BWfR|Ktd@bd@nGiKt[jW|AsGpEZpHcMfHvMpWjSvF`Ubj@|n@tGkLl`@~^gJ~MzH|FYbDvYdT|KxVsR]lDrLvOrKhGxOrlA`s@mu@|lAt@rAxMfDrBbGbOxC?`K~BfDdGcAtNbLf[rKzHgDzOjDM`PfB|DnTlLx_@hKfZxTvR|AlMlQvHp@a@jF~IbGdCrHlGBu@tCpDrLi[teBqy@td@kXbeAdQjE\rBbS|CfGyEzCfDy@dErMvIzBsA|ElBbGqE|NXtZ|UpGhB~DyB`EjHo@zMbLlDnFtMnInG|NwKxFQdDlMrFvC]`FzCrANhEvU~[hFfCdCdJtB`B`G}B|FjA`KlHlAzEnKsBvA}FvOpPz\`K~U`On`@|m@`NxLO|BpH`ItBYlHbNuAlCjFfGhN`LvEiApXx\bCn@fHsGOfHfEfI~Ex@RvCbJjBvFaEhTzYtTmIzEmFlJa\dStVnRnj@hJaIfEdJnDcLuDaJz@wDvNzIrMzh@`BgAtBnD~^v_AsF`KcMe@_NnJ`DjXjp@v~AzLpg@{LxGeAtLcDt@cK`QmAtLbJ~@lPvKbVaT|Rz^|Jr\xAfOi@rCoDa@hK~fAhKbl@nPhc@gg@jz@_WhY|JtFj@jK~Y~Lr@vRdKzR@rFkCbCbNfDbGdVvFvDhCzlAgEhByIbSiFrCg@`LgF{@mKjIOtI_EbHbB|QsB|QkLzAy@~E{BkBaInJ`@lH{EpBeKbQqKbDeRgGiDlGwDfAyDcBiDvQmErEl@vEiHjDgGu@qEmP`@iF}DCaGuOaE|KmC}@c@vMkEs@eAdBhGlWsC`Ex@dEuEvGbCf@nBpJgKhFkA~XeTrHLlNgTlNJjTyCzAsCeAsKdM~A`JiG~KGhIqMhDmD}BiBrEiOhFsC~G{GuFgE~FqKtB}IpVcYvTg@dDiWRuJhOpAzOqS`PgGgBFgFeGiGeNuCiHrMy@pQci@bSyLnTkJjAmFvJ@`G}Fr@yA~GyR`C$p$),
  ('ID','r',$p$ybbZt{pfAuDyHoLmFqOH{P|DaEqNkRsJk@{K{EkFcL}BoCjBcKuMiRuAgO}L_Nm@ePoIaHyIwKHeL_NcDsW}IoPgEsUaLgAeZyT}LiRsIaGk[wKs[lOcMqGgL`AqVs^mIoGkICmFmDiDsKqPsNa|@gO}MsF{FqIg[M}n@ea@cHqLyQwDoK{SmJnAeJiBu\uQqRaYqNmJcGAgTfNeYt\qYDoIxEeP~[aCjWz@xSyV|R{BbH@hNfEtMwDhMuSjG}JfJqQp[}h@tS{LdNgg@|N_HdH}DjNwE_AaCuMiLcBuZwPgUlZePqEgObFcKfNwKwAiJfTgL|@iIfW_GB}G}HeWsFmCdBuaYx@}dWmE_@qeR~~R?rAuJra@q\~@yG|HwBbI{MxPoMlEcH}BoKzGoEdD_KfGsB|PZjQ{HQuTzFsHfHd@bFaEYiHxMoUnXjGzF}BhJeUfN_@xJrFbQh^`Du@tHib@vAvGnCP`H}IvI}CgAiJhEqC]aRpJbE`B`EtAdj@fElQhJfFSyVpD_DAgHzHsXbMiH}AyNxHaX|DKhEeP|F^dCuEpN{EdLg]}AiFpD{HZeSlFiGb@si@|CkKlDdBvH{FzAcG|HgCpLfDzBwVjRaKxEcXfEcIbMaHzByPfToH~JaNd@gIvn@aX{BeKjA}OdYmXpFsUfBs@vHhHrLkApHrH~AmJxCqBxGp@vE_PfH_@pAsCqEcOnR_UbAkXpLyM`Kb@xMvKdJmLQ}HsG}Ds@iNcOuKdEw]vLiNxIZbFdJnKoBxAgLzImAz@_RcGuUvHqf@a@cI}CmFsCHcF_Q~@mGgFa_@tH{TpYi@zLlKzE}EzO|HhLf@dEmClFnExDx^fLaAvEuIxHBbHmEtAnEpLrAjMxTpOiFlNz@~QjK~I}CxGxHLxMrBlBpJm@vCeInKuBp\AdGfSiCxEZnL`NxGbHqAlH_\rH_HdRvChOfV|D\HiOpG_C~HbG|CeDo@}LvIuZxEcD|ERrKnOdNeJfEiJ|JiCxIdJhF~@mDfTbLvk@pGGzClHpPlH~IlLxIqKxGYjHuKj@mGtLwHhGvF|BLpAwD|KdDlL~a@hJaExF{HpLpKbKNdB}DiEsMpHmPuBqVxIiA~CcJlOoMrIq\rJ{CzGyHJkFwOaf@{ViMmLDvDqa@gH_GwB_[wOaGkCiUqK_BgI{GmO{_@_PlBiHaBgDcQ|GaOsB_MfMkCxRmTdKtCbBuJcCkNlLea@zIeBnJlJn[bH\qh@lS{CvR~MtMgKpDEhC|FpDu@BkGfIkPvd@nBz[{]lJt@dFmCtFmPvPqKtLkVxG_EzE|ArNuNzFfBpHwNc@wWdCkAjJ|GdP{Xm@oJnBkD`Ni@rPsFfDvDbW}@lFxMKxO|BtAri@}XbTyThCi[nGaL~JgEpD|ChCuFyVaz@nDiDnFuZnMcRxBgS|F|BrCy@xMmSvRoAbJeP|QcBlKeIvEtC|ArIhFfE`CYrRc[jGjDnDkAbI}TtCGjL`KxNaK`LaAjSo_@lKuh@fJ{@vKoO`@qEmKyRyGK_RrMkK{CeYq_@oKsb@dJca@{Acf@`EaJs@kY`LaYsI}O~Rst@{VyPsY?gC}AeA{T_H}BiHuODcZjB}FfGKvB{CpEsVkDaK`@sP|JqQeIqVfCaSeIsAdEm_@oKqSqCko@vVoPlIcLo@oGsE]uCyZgGmNIqLmIaF~Ecw@sG{PvCkMe@cIlDcMtE}C}@wZ_Fq@kErU_GMsCfGuL~B_F}@eEwHwGlCoBaJwKsL}FeA{DnH{IvAwHq^bEiN{FyHsMOgD_GdPgQiBoKhDqFbb@ka@zFbDfDwCmAkIhPyP~GlGhScGhBuVpLaGhI{X|HzBvIkEjFiKrGid@hho@m@bBd_U{AfKPvaIrF|bVsBhhBKhnIyCnpCzBl|BmAn}e@cz`@J_n@CiE}AkFzEaFyCScIuC`@{AnF{A_@mD{VkPiCkKfAuBeK{DAkDrD_PcEuClIsD_Ia@qLkCc@eEfC}LiDkFlDsGrQoUrAcHiZsd@wWmIvBcHxNsB|[m[rAsB~a@dKdLeQxUqLdHl@nI`K~LKxOiHjP{MhNsEsB_BmGwMmGiVh[cMvC$p$),
  ('NJ','s',$p$u_eW|vbm@gT_XuS}EwA{EkGwCC{E{[}GuG{FiLi[mB`EwV}d@uD_NoBku@aFsSgHeLeAmZgP}IyLbDyKs@eCcCeKia@uPsNwFmUeYuh@yKes@sKcOgM_GtBcXgGoMWmJgHgJsEEsIhHwCtI{QtI}Thk@}ZdOwYtk@ad@bOgGhRbC|R{G`ReVjFoRmD{a@dC_OxRkBrIi@jN~EbLaAtKqDvEoOa@aH|DsCgGkNlFqOyMoBpKkEjC_XsLqK~GmE}I{HsClAgVaGaFwAcH{SkNgHdG{CWIsQuIeHkRlNkJ`AmEbI_Q|LqHr@u@jGqK_AsMoXyN_g@iPeHuKuYeDRjC~L}J_EuQ{c@uYuX}VaMmDzCgLkEuAmEeToIsMmVcEn@}AsMcLoJYeSgEgOnrBqtFrlB_~FfbAzTdf@jT|j@r^n\tExJfMKhK|IzAjAuCxDrCq@lDfHlGxB~]k@b[jGtGzSu@hVzHzE`SrPYzRlNhNqDxIq_@hDyCwJiLrEeMmDsLtSio@fF{_@B}C_SgCoBnFkQdHVyKpPkH`o@eFdl@vBjmB~_@|LTxjAnSbfCnS~l@~Z`sAv|@pXtZtBzXnBv@tP_IjYrLvQbShNxWlIvBzHn\nRte@tKjQfHbE|CnKhO|SlS`SjG~Afp@hf@pIgDrPfSbYxRpAlM~PkBfd@~n@[bJ|FxVuAh\kC|Aae@kI}{@_c@od@sEaIfJqHvb@cAzf@gKBiD~E`CxEt@`f@bR`OaDdH{FrImDwAsRlG{@~GqIvGeFhUcOjEqAjK~GxIcLlOuTpJq@tL~BzDqIrNgLxDqFhSq\zSe@nJmJnN]nP{J~CsIa@eAwHqREyDnCuL_KsHi@_NnXmP~A$p$),
  ('NH','rs',$p$q_dYtbhk@qQeA}EoKeKgDqWzC}Jq^f@}CyEsFwGXyD}JcKrJmHi@mFlCeQoR}JhCyJiEqEdEoBg@}@|E_EdBcBiBsJNwCwD_GhCmE{FcIv@_HgCeKbBqJoM_YoKuJhHwNuKsBpMsGr@sHsFad@gGcId@}FwEiGOoK`JwGwAmGsGwSSuOy^oJtBgIiBoCkH{f@_HePyP{GaW{IcHoBiGgGHyMwLcGhB_G_CkQr@sByIqExBeC{@OcEaH}DyI}QoOm@uFoKsE~HkIy@_EfBeDgGeE\qE_FiDqJ_FbAmDeIkMsKeCu@wC|CyA{HeDTgDrLcEq@gFsJqBdDkKc@oSfOm]mJiSlK{Bo@mN}RqJG_@mMuHaQ`@q[yFyPhFoTeJic@cP?o@yGwC~@sC_EyC}RhByJgDoCwByUkFcKmCMiB}IsKiDiAaGsBtCeBg@oDeGs@ySgG_D{@uG{JlIu@kFoG{DsHxMuCM_BuB^_RkIcCZeDuDkDeBtIuM~@sEaBaExEmCoA}DtC`ArDqDdFwG{AoB|GkOdAyIrJ}BMAnCkHDiDdCcAwGyOqNuDkKqIoAqC|BqLqM{EzAeCiDmCV{EuKcLqHoEiJgC[uH~KiVRwM~LqGoGRkV}FcMBpU}QgE{CvGaAsC{HBeIaRqOsLqEoIsBg@{FnE{EoEwRmFuJuIiFlB_M`Xh@mOkCaHvDaJeFcDgDcKiIbAaAeNiQo_@nCiAb@{HxIw@~C_JnJkG{AoS~G{IoEiJpCsMgUaSwBbAgEmByEiLfuKa`@lzOeYxiCgI`KuLzG|FzG{D~FLfSbKxC_G~JlBrFqB~M~NhIsAdDbBp[wKpE{GeAuKnCe@bEwJdFHbAkEfGhApDeK~DiA`DgKnDcBf@iHbF{AbB_LhGcDvR~D|BrDpF_BhPlEbJqBvUqe@|FgEhCo^lGk@fAbEvMhBjCdF`TfKbBdFzNjEjL|LzJrAbFlFfVnCbFpRqLlVoA~P~If_@dElg@jHdIrVlImHti@|FtSfJxKd`@uAuDhYpAnLn[l]uQtvUmT|JaFlGbCrNwGoC{PdTg\lG$p$),
  ('MT','rs',$p$s{q\rqyeA{cI@VgkiFxeUkCxjc@dB`qRyCo@lrc@pCfHCrpEwCzfTb@fy`@}BvKf@dtRxCzv@wA~dBfCbX^l|AAp~AuExp@`@zgDxeIw@}Ddb@kFhKwIjE}H{BiIzXqL`GiBtViSbG_HmGiPxPlAjIgDvC{FcDcb@ja@iDpFhBnKePfQfD~FrMNzFxHcEhNvHp^zIwAzDoH|FdAvKrLnB`JvGmCdEvH~E|@tL_CrCgG~FLjEsU~Ep@|@vZuE|CmDbMd@bIwCjMrGzP_Fbw@lI`FHpLfGlNtCxZrE\n@nGmIbLwVnPpCjo@nKpSeEl_@dIrAgC`SdIpV}JpQa@rPjD`KqErVwBzCgGJkB|FEbZhHtO~G|BdAzTfC|ArY?zVxP_Srt@rI|OaL`Yr@jYaE`JzAbf@eJba@nKrb@dYp_@jKzC~QsMxGJlKxRa@pEwKnOgJz@mKth@kSn_@aL`AyN`KkLaKuCFcI|ToDjAkGkDsRb[aCXiFgE}AsIwEuCmKdI}QbBcJdPwRnAyMlSsCx@}F}ByBfSoMbRoFtZoDhDxV`z@iCtFqD}C_KfEoG`LiCh[cTxTsi@|X}BuAJyOmFyMcW|@gDwDsPrFaNh@oBjDl@nJePzXkJ}GeCjAb@vWqHvN{FgBsNtN{E}AyG~DuLjVwPpKuFlPeFlCmJu@{[z]wd@oBgIjPCjGqDt@iC}FqDDuMfKwR_NmSzC]ph@o[cHoJmJ{IdBmLda@bCjNcBtJeKuCyRlTgMjCrB~L}G`OfDbQhH`B~OmBlOz_@fIzGpK~AjChUvO`GvB~ZfH~FwDpa@lLEzVhMvO`f@KjF{GxHsJzCsIp\mOnM_DbJyIhAtBpVqHlPhErMeB|DcKOqLqKyFzHiJ`EmL_b@}KeDqAvD}BMiGwFuLvHk@lGkHtKyGXyIpK_JmLqPmH{CmHqGFcLwk@lDgTiF_AyIeJ}JhCgEhJeNdJsKoO}ESyEbDwItZn@|L}CdD_IcGqG~BIhO}D]iOgVeRwCsH~GmH~[cHpAaNyG[oLhCyEeGgSq\@oKtBwCdIqJl@sBmBMyMyGyH_J|C_RkKmN{@qOhFkMyTqLsAuAoEcHlEyHCwEtIgL`AyDy^mFoEeElCiLg@{O}H{E|E{LmKqYh@uHzTfF`_@_AlGbF~PrCI|ClF`@bIwHpf@bGtU{@~Q{IlAyAfLoKnBcFeJyI[wLhNeEv]bOtKr@hNrG|DP|HeJlLyMwKaKc@qLxMcAjXoR~TpEbOqArCgH^wE~OyGq@yCpB_BlJqHsHsLjAwHiHgBr@qFrUeYlXkA|OzBdKwn@`Xe@fI_K`NgTnH{BxPcM`HgEbIyEbXkR`K{BvVqLgD}HfC{AbGwHzFmDeB}CjKc@ri@mFhG[dSqDzH|AhFeLf]qNzEeCtE}F_@iEdP}DJyH`X|AxNcMhH{HrX@fHqD~CRxViJgFgEmQuAej@aBaEqJcE\`RiEpCfAhJwI|CaH|IoCQwAwGuHhb@aDt@cQi^yJsFgN^iJdU{F|BoXkGyMnUXhHcF`EgHe@{FrHPtTkQzH}P[gGrBeD~J{GnE|BnKmEbHyPnMcIzM}HvB_AxGsa@p\sAtJczHA$p$),
  ('SD','rs',$p$kzmZ`ko~@UsJwnQ|BhEacqCpx@vElMjDbT|ZlOxGfL|KdVpr@xGzHtVxm@fZvLzs@yx@df@kSzXcXfCoFn@gf@hS}z@pJmSzc@oUpbb@BA~yA|JeJ`RtLlIkDnBaNzDbA`NyUWgFtEmA|IpB`L{@tErE~MyDxF~AlCdMsAnPlJeAxAlDjBU|EkSpEFdDjJrCu@rCaDcAmNdEgIuAsYfHyBzI~@zCqDxR^`DaIjLsGjQlOnCoDrKdC^`IfFlGPlKzC`D~AyDzFd@jHaKxEbBhAhGdHvE~D{HbF}AzGvDbMbSpLqBrD_Ej@pG~Ek@~AzDfE~@vF{BjA|DnB_@vAjQdEiAzFhJdCgBpHxAfExDShHdGzFjGcAvKzEnF{CGoCfKtBnMqa@vLqS|GyA~HoLvXqHzGoHzGfG|AwL|Rx@hCdGtOu\rExQu@`OcRdPoCnKlHlYMvKyElIcRlCgEdDqIrViQlPiJBaNqLkEdAuE|U`BpUoAdQ{BrDuKa@iFpBoQz}@vGfa@qCrAmG{AeKdJm@p[cEnXD`h@yMdKqG`d@yUlDqC|Jo@n_@qFnI~F``@oEtI}@vRxLfTkBv]iChGxEtb@wEd^~Htm@sC~u@{Jv`@TnIrDvQzXhG|X`]xFvf@QtTkDnNoFvCaUpd@iKbKc@xYoRve@qGhm@cItKgQpm@t@rMoJpM{^nRg@pnkB__f@zA$p$),
  ('WI','s',$p$_xtZrjat@eCeEsNpDiVcJdGiKyBcXhDgNkBeM_Ja@tBsJpH}AVzJvXnWxRjBrAhObT~AcQbOiJ~QaE@$p$),
  ('WI','s',$p$qxqZrpit@wFwX`Wf@zHqDmK|]wL[$p$),
  ('WI','s',$p$qhu[lvev@_PFuL_DuCkFk@cXzCqApYpEnFlF~HbVcB`GaHkD$p$),
  ('WI','s',$p${rr[hxfv@_Ji]VoGxClArIrTKfKyCnA$p$),
  ('WI','s',$p$suu[xzgv@lKuKbJb@|AhIoVpG_BiF$p$),
  ('WI','s',$p$acu[j`iv@WeKfGqDnDfJiDxFuFi@$p$),
  ('WI','s',$p$ios[jpiv@uIsIsMsz@[sIrBwEpDAnIbIpHzM^va@lFjPgF`KgCo@$p$),
  ('WI','s',$p$sgt[t`jv@}HuPEoH`Eu@rJfR_@jIqEW$p$),
  ('WI','s',$p$ysu[`mjv@iEcB}@oF|CsGlIdCtArEoAlFiF^$p$),
  ('WI','s',$p$cwr[xojv@gEgNbE}DfDpKcDrG$p$),
  ('WI','s',$p$_zt[tvjv@sGmFPiL`EmC`HxJYbJgEfA$p$),
  ('WI','s',$p$sgt[xgkv@hC{NzK{KfIuBjBtEBrVeSrPwIoN$p$),
  ('WI','s',$p$ovq[nwkv@}UuKOuMpIC|MxPaAtH$p$),
  ('WI','s',$p$amu[l}kv@sDeInGuKtIl@lAbHeB~GyKhB$p$),
  ('WI','s',$p$_yp[`elv@aFaZ{LwRgMua@kQyTBcK|LsPlDlAjAdUvMdh@|C[|CuKnFZlBtg@hOlWVxL_Cz@wEeCoEfEuB}A$p$),
  ('WI','s',$p$eut[x~ov@wFs]tEoChMpBj@~SiEbHiGl@$p$),
  ('WI','s',$p$wdzZ`fuw@wv@yJsOcd@oKwNcOaDkIuJwMpCaIuNsLwBwMmLeHmUiIuIa@wK_EEEiNwI_f@eIi@oHeMzDac@oY}O_DqG}@gJdGuV]aLk\yJiFiWarJu@zI}K_D_H|DqGMyQeBiEmFb@gKsPwDlCs@zLqBImGwH^wYwMgD_EqQAuJ`Y}`@p@_P`My[sFkjBgd@s{B_Awp@wDuJcC}YcKmXU{W}McRuDsMiEic@uOuQk@aKjFsC`EsL}@sGsIkHhD_WoBaHgLqBZuV}CeGuGkBaHsWmOuOzFc\eKqXqCYqAyM`F_OtJ]wA{RjEcFfIgAhFcPlEgAhF~Jf`@|PxS|UP`LdDjCxFWjFdMff@oRlM`SpCzNpVfGnNzOrF_E`BuUaJgSyTk_AkEiHmJVaNoI?uC|~@ykBhBqKiDaSpPui@{AeK|SoNkDwZgF{CIwDtGcLnMjA}CaW~IcBYmUdDqKhL_FvM{NfGM`@_FbRyDp^gWpLd@`{BabSnhAklDmFaLpA_HxBXt@mCeCoYnE_Fr@gXjLyHjAoGAcQqOgG`BmNeEui@v@gDbNiGTuGqDmGzNg^wGgXdRw_@tBoT{DwR`H}PiAyWxTgr@vHChIoDhBaJ`FoAl]xd@xSiYnB_OmG}p@vNqCfDsInBqu@zDeH|Ch@jEoDxJg]jFc@bKkNlG|VrIrAnTiZdMo@tJ~EbBdUfDl@nGcHdZuJ`VrLzPl\nOqFhZpS|DsClDuNwBoZbAoYaWef@NqInHyLdRyGvX~VvQzF`E`FrK\nBlFdMp@xEfHhPyAbRca@xKwDtGsHtFyh@rB}@tGpM~QpHbd@z@d@lJnExEfDffAvGv\bKdKfGhBbNsGxEpBz@hE|WlKdGxTpk@fXxFnMrMvJh_@bCxAnFxOxCjP}EhCpGjUvQbPaVpDwTJyO}BgHqSkPwH?}MmTmPic@{@_T}E{KmI{BiO{PqRTefAgdAkG_QoBm^sF}HvB{UeQ{XdBoIhFEtGgEeAwNiNJaH~KqCWkn@}Zc\{Vo\wb@cXuCeIuIkQi@yCcIxDwCr@_K{L_SsB_Z}Rv@gTyGmD_R}O}K~CqGaHyOlA_TpIcGxGvGpHa@t@aE`RbGpAnImE|ACrNvEfDd`@tAnFgIbFpIjHjDhRyBlJrRhFl@NpWp[jJxC`NtUdOxKSjImIpNtZnDVzL}F|Phf@bSnHhEzLvErDnDbCpG[jj@vTdk@z\hOlUf`@bRlaBd^tJG|`@jPtPsArf@oS`VxAtSzOtHpMxFpVzOp[fMjDxQPxR`Pz`@tHpPpKzb@vIvj@cEzYiOvR~Db]oCxlAru@jUtCpTwAxRbHpq@lg@hl@lIxb@bMh`@uHpOoHxS~JbFBxOgNjN_E`SzPpOLpHaD`WqYnl@r@t`@iNn^kb@fVtHtWBnS|Kfd@jIxPoD|b@ZtVkFuAvcErArbLgGrsPaAlrQkEyB{NpDm[|Wa\xMwUjnBaGbTCnP_FxPcK~L_DtOeGjDQlJoHpFgDmB{CvDic@vD}@rH}Ju@wSvDqNb[gTtAcIyAoK~Ewv@hMai@sAaJeQa[_NgY{a@aIiDeCdH{FTiW|ScIxQqKth@_IvEkQuIiNjBcU|QeO{IsRZkPbO}XaF}S~UqO}BoNxE_Z_BoK{Fa[kF}IlJia@pLuKxOeL~D}P~UuKvDgPnXyTvQ{Jpj@wFbt@eJnJgHjVyS~SaCfOkI|@cEzEyAxQiNfb@}JdL{Lv[uFj@kJpH}KqB}ErDkFFuIrPsJ{EuFbBsWb[sOpm@wGnJuY~lBaXpc@gH~EcIDmLfF_IvL_Cjp@zCtMeMjq@zCnPcH~@kLzJfApHsFnIy@nK_Ka@gHtFmF`Qeb@tn@wSvj@gJg@}MqKa[mKsNjAoFqB}M~EyE}HuPaDqJnAgIfHgQb@iMuD}UrXsJgFoUm_@}WhJoJiBgF~GcKy@sGsFiRhDeIiDeLjEmTm_@mH{EyLhA{GuM{KmHgBqG}YkAqGhCsDtOk^`\sOKcOpZvBd`@yFbc@ka@jC$p$),
  ('MS','rs',$p$sdmQdv_u@k@mJ|FoWuF}ZzFmAhGnNfAfNuCjXoDzGcFh@$p$),
  ('MS','rs',$p$mvmQnydu@eFsb@rNkaA~FkLoAvs@aH~YvAjYeA~EmDfA$p$),
  ('MS','rs',$p$edmQz`iu@eBu_@kPca@rA}DxKjLpJj`@dBzMoCbMcD_B$p$),
  ('MS','rs',$p$irmQzklu@Rym@yK}GvD{GbVbJzBpTkGzJwDvYmEuE$p$),
  ('MS','rs',$p$kkaRjc}v@mHqGhBeo@qGo[qDaCiRcAcSdX_Uw@mA|DnDhGmLxDeNeGyDmId@}ChXeDnKeIhBeV}B_CkNGkNlP}PlHae@CoFvCgEiD`@mTqFkUyOoUwKoAqCvJzEfZ[|LeNnPiMuAmEcJfKsKvG}ZsD{P{MiBq`@tAsT}JuDcOmAwp@sDqFyFGsAxEjBtm@yA`Ikl@{JoEmFiCgXj[_FnBcGeAoGuJsEqLlM_EG{GoSmRaSgE{LuIpAKhDuQgDsIwK{Cud@oOsPaJrFgHpf@qEdEsEScFcLtRgUd@uMkQXqMg\eKkA{AiGgH_FsICmLnZnClDdLoEfO|AcEvPrDpQyCd_@}LjFeYoEiIcRfBuNkJoNzC}LaK}EwAaF`KqUzLJZqFwF_D{R}@qDyEcJnGsMeA_AsHpG}FmC{IsVeXqQ_JcHIOhG`TtMaHvq@yGxEkUoEuIkPqJ`AaFdNxIhUaBpMuKnYgN|KsIL}NsH_KcAnLaRnSiQdDeToBmG_DeAaGxCqQxe@yKdK_LeX}LgO}KoCeJ`FyBdFjEzFfQbF~Lxj@wFfLuJjEqP]yQuR_Q_a@eIwDeDxBkDrQqCni@_HnCaMqDmBtCyUyB_MeHoEyHaA}L}Q{TgTeCyLfJgJ]mG~B{FjKvD`QdD|@tD}C|DnCdOcCjLrGlB|QgCjL_GfHiIVcIkGqDn@iRoScOsBoJyUmJ}BuO|PgCfMoJhP{Hp@cKiJDkM`F{GuAqb@eCkB_Z_AaUbJy@eJsNsPeNyD{EzA_@pPpDpDhS|EJpEmOfLiFo@cK|Ho^?ac@ei@uKyHcLJcCvGjBlHfIxDzHk@~S`UrB~IgCxTeLlOiEkCoEcg@aKaKoNxAmF|EaG~MvApFzXZdEtE`C|McApMqBnAeH_AcEuKcSwMcEv@wM~RkM~FgDm@gBeh@cOcTqGgAsIbDkMfTmG|^aGfDuEW{G}JyBa^zTiUzGgVuH_`@oEwAoR`QvD`c@wOzRyVeBmG{GhFwKuBeb@nGuQcDgP{EaCuE|AkDlHgGjXwLxIsPbC_U_YaPaLkGjDqHxh@gTxAaIeBTkIbGeJeCgTtSeIfC{KcAwFoIqBcWjO{CcQfBqSkB_TePyAuOsIsHhF|@`WaInO_GxE}G]_Qm\nPib@cCiRaJkHoH\{BfDgA`V~A|SmF|MuNrMaJVcEgGPeGjKmGnE}IzCwSwF{Cy`@yAkBkLfEc\kKgPkLi@eU`SuEb@_EiErB{\yBgQrZnE|DkHm@mI}d@_AuEcG_BgU{KyNsKcCua@vHkPqFgNeWsGy@}h@n_@yd@_NyEn@b@uI~DqFlTxGnEaArDeKyByJkSmXwKaEyJbF`EpYwJpa@sMgDUgJgI{BoPfDyFkCyBiKfAgE`DB`JqJrHh@`OhQrAuCbB{SyByKqGgHma@zPcIaDgCcFo[hPqJaCuCuI~C{MpIaDvNtJ`I}EgBu\{Om_@jGyLo@iDkGw@{EnGsMoe@gL}GqRx@mQb_@_KfG@geh@vl@m[fHeJrHgWhlTtyArcd@znCbaSca@tuHwMlDpAbFeBnC|HkFpDOlHhCzFjJpC`FlO_AlNsJ`J_ApGpGvR]xG}NhJmBzf@nJ~URtPkYtr@dNnCsRfh@c@fVdE|y@zHxh@rg@p}ByAlDyKs@mAkEcJc@{H|FcEbMZ~KfBxIjI`G|G_TjMgEnFrCfJjU`HrG`IzWlR|EhJtIhKFdFxHmKjIbGtZkHzGtHtRkFvHiKxEcF~JkLa@uF~IgMG_DnF}J{@uC{GsNdAwIdP{]pOaDgBsV`BiOjO@|ByGlDmG|SoEp@NtCiQdFm@xHgEOoAzDwB{G[lJaKQ_D|FwFuBIzDcOgBgEjAmGbFkBzJuPoI_Gr@k@hDiEiImDg@k@bDuCJ}A_Ly@fEyNjBgPuFfCmCk@kCsC~BiM_G`B_GqA}AeJpDcDeEuDlA^eFkE{AaF~EmCwD_I|@R_HcHlBkCcKkNdFmM{KOkDmDfEgAcCoGw@_CzCsAuBtAfKBxzc@kNqc@kHwGmHyA}FtAu_@|e@cHm@sWmS{K[iHdFcOvY{IrE$p$),
  ('SC','rs',$p$kheTv~zq@kRuSyQjA}GeMcDb@q@mDcEwAvC{GyAuC}MIUeGiQuHwA}SoGk@sBqIwOwSZ}F{GeKeHtBaQoKgJ^us@mgEhAeF`HnBt@{AmAiKiOeRwAaSaPaFxCgL}EsKz@gG_GaK}@sR{IkPlAyKaMuj@~FqDKgFmSmKoIwO`BqD`L}@bD_E{DcEm@qIdDgLqHi]j^q`WjJrCjBoFlJ{BhF`KlMtBvEG`JaIef@qaAfjBs~AngAtHlHk|T`aDceEdpL}|NjR|iA`\d~@bd@`w@`n@vt@|l@ti@vSdL`^`b@zp@v^`OpFplAnSt\}CpStHz\|d@vDdUtOr[fp@|Uv@hZyCzGzAfYuAzLsIjJs@tHxG~ThHlMp`@`VpGGfGcEkA_OxB_DzHzC|J|]tUpg@nH~BjE|I~FW`DxCbQzs@rEnC~E|Q}BzG}DLqIbMxBfVfPhBbA{]~HuEpStJ|Ii@`[jw@xPdRKjPpH~m@bJtWrJxJP|RrNr_@|a@rq@KvB{JbDkAhEjOlUzA`LaPfEmB|H`ClSnUxFvGwA|UeMGiNpD}@rOvA|V`MnE_@vZpw@nDzNCxNdJpY}DvCoOa@aFhZiMhOzBzJlGdAOdIzGzFzF}AzHoMw@uKbR_X~JiCdj@`h@hWdq@{AhQdc@dc@bG{FrDFiAdOkR|U{EzPwK~JC`EfH|K@|IeBlIwKjNgC`OsZ~AkAvCcEkEsGWea@~VeKwEcNkOcJt@gMpHeGoA_EpD~AlFoHxHaDO{EjFaFmAaSlPsF`AkBgCsDNqGwHmAfGaR~SoEdBsCoAg@jJuIbNeLrAaClIb@fR}HzVyGv@j@zD_ChEgTjQ_DmApBuC{Ek@oDqFsDzGsI{B{IpCkC~JwYwIwM|HaEeBuC|CmS{EcMhDcEtINlEeN?kC|NmIqH{ClHcInAoG~J_E{@iGrDmBkDoHeB}Qo@qJxJ}JtSb@|FiEdARvFkIvHStEyDSUfFkFx@K`TuLjc@qNnWgJ`KcLxD{IuHgKnFiA~EbEs@~@jCaA|K_FvAqNpYwJ_BeCsD{HpNuDa@_@mFqCm@oCzKbC|C{@dD}KbIhCrDkEbEoCUaApL}EaBcHdFn@yHuBsByQrFcCqI{HdCwEkG}N`GwMfd@_TrHiZb[yJz\aGpFpBhMwArG}GjGuFtQaEnEgTpAgUdTw_@`GiRv^uId@cKdNm[rp@`@xJcJdSsPrVqLdHmFpIg@dSoTfMsFqAaDpG{PjBwTfSmDrIoKo@aF|IsPjJwJbXgd@fNeb@~A}Q~S}YrGmOpXax@`OyBfHkFZsEbOxArK}AfJnDrGkBpNrEpMcFzRcKjKNjHsG`JqDuDqC`EA~GmP|KkJpQeEf@sAxHcGEuBre@eCfFaCu@gGbHiInVsHhFDjFcDdByAvIwI`FkQ~@$p$),
  ('ME','rs',$p$cr|Yjnvh@mE}EgAwJtI_ItDpC?~OuFbF$p$),
  ('ME','rs',$p$i_~Yznvh@cFaGcEqRrCeGpPxJl@fDkIvQ$p$),
  ('ME','rs',$p$_o}Y~{xh@o@iBye@mFeCwClQ{LdHkV~RuR|GhFhNdYeQlJ_@zWeGrA$p$),
  ('ME','rs',$p$wq|Ydgyh@wGiFzIuHhEbFiAzGcE^$p$),
  ('ME','rs',$p$kbaZjmyh@sG}CcMi@YwIdf@cMtBvE}E~NoDnH{Ec@$p$),
  ('ME','rs',$p$y~~Yro_i@}BkFbBeUjH}LzDOlE|EsG|]gKbE$p$),
  ('ME','rs',$p$y{wYvv`i@aAsFdBcEhQeBrI\bBdDo@rHsQ`DaL{B$p$),
  ('ME','rs',$p$oq|Yjqai@cUaPwTyj@aAyLrBuBdKOEkEpH_It@eF`CbFAdOfH\|BmAIoDd\yUbTbVnEvh@wKlZgLgJkJjGoNwAw@fU$p$),
  ('ME','rs',$p$oh_Zl_bi@ec@{\}N?_Z{H_DkNfBqErI{ChK|EfEdL|FjAxJuDnMnIbVzF|KbNy@nFwJj@aDjF$p$),
  ('ME','rs',$p$kyuYj`ii@aEaF`B{J|EhArC|FmAfHcEQ$p$),
  ('ME','rs',$p$k{sZ~fkj@_Gkj@}DcC{BlDyFEjHwNm@wT|GgFdDiLxHsBnI~D`LmMhIa@~F}WgDkJmC|DsJDe]_X{GE}GdFgIkBiEiF{RpMuPoPyAiIbAePvP_NnDaJkAmTfDoI`DWqByNsZNmd@|q@uNrBuU_UiHJiMaQsKcHgMw_@_VeT@kS{T}a@w@kRsHaWmHoIgH`BqFfJoS~EuAsL_ELqEmDwSm[uCsUmRm\yHgByIzDmKmM{JvNOd_@{J{DaGiMgAnJyKbHmVqWsBtBa@nOkTgOe@cS_Et@gVwIsZfa@kJ{Kyb@yMyIyHuH{OaHs@cHnB}JyIoEmIGkOqEwJoFsA}AmHqMyG{B}WwmDad@y|M}aNtCyKwA}NxC_SpN}f@uDiL~BqJtJsB`IhDfCyBnCbHxjAgAvHoItP}h@lCiBOsJjDeJ`KwMyFeZiNi[gCy\sJc\v@{FyB_J|CaOiCmYaHeNsF`AaJqKjByOuGaT[}YjHiOeByj@eCo@kDjD_NKcIqByFsI_Bmo@|C{Jq@aRrHoKzGcd@tHy@rGoHbN{`@pFoDrL_a@zOmQdFqTtTkKrUiZfMgD|Lkf@bJkRt|TmDnDeAdI_P`DbHjFhAn@jI|FrJhMsCtU{XlBrNtMpOpWE~AgGbK_Fd@lPvSeCn@fHzHcHDuTbE_HhBcTmBm@cIvH_BPHkCtDuIf]}TzIoQ_FyBlJ}SdKwaAwCyEcCXeAoT`LaObTmDvDvACfCrFv@tOqJcC~[jDzCfFtShPkLnDd@tOyEdScZxHaFlFvHdEaCrHnCpGhL~DoAfIdDbCtBn@~JhEfAfVaOtIwMbT}ErGsLdKq@|S{c@oL{]mBc@{CbDiE_FcIOwAkC~EaVtIcKyCsMnEw[l]m[fZoLnFxO|OgU`w@k]`Ps]vQtB~NuFtFnJvSyGwC}H`@kIhE~EnBtN|S~WYnUdP~EL|N|MdBvLnN^nE`OpHlB`SlClBfEu@dD`[vEpFz@|PvJkG~Bf`@_F`DkAuFeLsI{GWwEtI_Sa@_HmDbCnb@tClIa@xMfFjDtJkRnRwElCdB`BxDgC|EfSnIiHhM|EhQdMtS~JRd@rOyI`KvEjVhL_GdDtBfLk\`GoFdTvVxHhXgHvCqNtWgKxGgQ~Ch@tWtBzBrFiAxEzA~DtEUjKUzDeQIwIzE{AjGtInGrIwAbKtIjK_FWnGaEjE|@zJhJ|F~CqChVhNcIrMp@nDjWtFoUpG{@~CrAxDtIPyAbNjAtBjG?pFxI@fCiKhHLhHpDnAdCmBrQrKr@hE~ObBePv`@kVn@I`H|HlIgCtF`@nSdFnCj[wHpLlJhIfSpMfBbA_MhNwGl@tBt@hi@kDjR|IlKj@tLmN`W{ApM_MlJ_N`FwG?yRfO{NmLoK}m@eGW_PnKQjD~F`BpKzMVdF}AvBoVuAqD`EHzHxElDhNcBvGhBfK{@XbBQrFiEbB}HqEyPvCa@bBzAvDtHdBPfHzGrHiAlR~IhAxEkBp@wDnI}AvLbJnKz@rFgEP_JxWwJrEfErG}BvGnBdEdUtKIrIpTbKdGvDoSpErOvEjBhBrFzLgB~NcTlSzKnO{@n@rHuCxIrGbMkl@vFeAkM}QvFqIWaW`e@mLMmHtGwJh@wEcMqSiSsIt[aJfN{LqM}DxK\zHpLtSuA`Sg^wFe\jC_KaCeCqGkHqAaBmF_UiCmT`Ij@zF`M`D`GjJfNyAhSn\ShEeLdG_BvLdJlE~DdHdAj_@pWgK~EaJ~JaG|XtEhJpK`@lNxKZfX|Tze@|GpExNjRqArFzAhGzKxEB|CuDwDwX|HyJhIrImB`@e@pGbHtHr]mUzHpMnIbE}Cfj@|A~Pve@f[mAbM`Bf]tGnDdHyGvJLdEtNq@|DyMwBwJxC{ToNwDnQfAfFjJnBhAzMiEfA{H}DsJlAfDrOQxTjLaDvMnC~Rbb@rYjK~BfFmG_@gRbFwAlNvJwAlKvCu@pK|KrB`BhEdAxIyEYeBsFwK_AwClBPdEnRhI}JrG~DhHd[WnF~DyXbPq@rKtUtGzIhLzNdGfMvq@|G}BlBxAcAnLoPH{C`Ak@bEeIaCmItC`A|S{CzM|GlLe@~DrM~NfT~Ik@xTwCpE~BjNxHzKjIcAvDtCuElKXjUbChIpHhDjOfQ`V~EjE_IjLsAbDlKrJzEY`JsFWe@~IqDrElJ`UpHG`@pGkGxC~A~M|PlOrK`CfMkBlF_G{BaXnJhIvBtOtRvKhG~UrPcF|BrFa@tGdIvM{B`K|B~HmAfIxLrUjl@~W~N_I`W~OpH}GrCtBYzLfQfAjCnFb_@tRfIrVoHdB\bQaCpJ}FfEoTvd@kKjCiPmEqF~A}BsDgSaEyFdDcB~KcFzAg@hHoDbBaDfK_EhAqDdKgGiAcAjEeFIcEvJoCd@dAtKqEzGq[vKeDcBiIrA_N_OsFpB_KmByC~FgScK_GM{GzD{G}FaKtLyiCfImzOdYguK``@MmB$p$);

delete from private.camera_ban_states;
insert into private.camera_ban_states (state, bans, geom)
select state, min(bans),
       extensions.ST_Multi(extensions.ST_CollectionExtract(extensions.ST_MakeValid(
         extensions.ST_BuildArea(extensions.ST_Collect(extensions.ST_LineFromEncodedPolyline(enc, 4)))), 3))
  from ban_rings group by state;

-- Why an enforcement camera should be hidden (null = show it).
create or replace function private.enforcement_suppression(p public.surveillance_points)
returns text
language sql
stable
security definer
set search_path = private, public, extensions
as $$
  select case
    when p.category not in ('speed_camera', 'red_light') then null
    when exists (select 1 from private.camera_ban_states s
                  where s.bans like case when p.category = 'red_light' then '%r%' else '%s%' end
                    and ST_Intersects(s.geom, p.geom)) then 'state_ban'
    when p.category = 'speed_camera'
     and (select count(*) from public.surveillance_points o
           where o.id <> p.id and o.category = 'speed_camera' and o.status <> 'archived'
             and o.geom && ST_Expand(p.geom, 0.001)
             and ST_DWithin(o.geom::geography, p.geom::geography, 40)) >= 2 then 'signal_group'
    else null end;
$$;
revoke all on function private.enforcement_suppression(public.surveillance_points) from public, anon, authenticated;

create or replace function private.keep_enforcement_suppressed()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
declare why text;
begin
  if new.category in ('speed_camera', 'red_light') and new.status in ('active', 'suppressed') then
    why := private.enforcement_suppression(new);
    if why is not null then
      new.status := 'suppressed';
      new.suppressed_reason := why;
    elsif new.status = 'suppressed' then
      new.status := 'active';
      new.suppressed_reason := null;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists keep_enforcement_suppressed on public.surveillance_points;
create trigger keep_enforcement_suppressed
  before insert or update on public.surveillance_points
  for each row execute function private.keep_enforcement_suppressed();

-- Groups only form once all their members are in, so re-check after each import (hourly).
create or replace function private.sweep_enforcement()
returns int
language plpgsql
security definer
set search_path = private, public
as $$
declare n int;
begin
  update public.surveillance_points p
     set status = status   -- the trigger decides
   where p.category in ('speed_camera', 'red_light') and p.status in ('active', 'suppressed')
     and (p.status = 'suppressed') is distinct from (private.enforcement_suppression(p) is not null);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function private.sweep_enforcement() from public, anon, authenticated;
select private.sweep_enforcement();
do $$ begin
  perform cron.unschedule('sweep-enforcement') where exists (select 1 from cron.job where jobname = 'sweep-enforcement');
  perform cron.schedule('sweep-enforcement', '17 * * * *', 'select private.sweep_enforcement()');
end $$;

-- 3. "This isn't a speed / red-light camera"
alter table public.reports drop constraint if exists reports_type_check;
alter table public.reports add constraint reports_type_check
  check (type in ('new', 'confirm', 'gone', 'wrong_location', 'details_wrong', 'not_enforcement', 'other'));
do $$
declare d text;
begin
  d := pg_get_functiondef('public.report_issue(bigint, text, text)'::regprocedure);
  if position('not_enforcement' in d) = 0 then
    d := replace(d, $a$('wrong_location', 'details_wrong', 'other')$a$, $b$('wrong_location', 'details_wrong', 'not_enforcement', 'other')$b$);
    if position('not_enforcement' in d) = 0 then raise exception 'report_issue did not look as expected'; end if;
    execute d;
  end if;
end $$;
