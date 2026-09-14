import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

function getInitialBatchSize() {
    if (typeof window === "undefined") return 8;
    return Math.max(8, Math.floor(window.innerHeight / 100) + 2);
}

function Quiz_list(props) {
    const location = useLocation();
    const add_num = useRef(getInitialBatchSize());
    const isLoadingRef = useRef(false);

    const get_quiz_list = async (now) => {
        if (isLoadingRef.current || now <= 0) return;
        isLoadingRef.current = true;

        try {
            let add_quiz_list = [];

            if (now - add_num.current < 0) {
                add_quiz_list = await props.cont.get_quiz_list(now, 0);
                props.now_numRef.current = 0;
            } else {
                add_quiz_list = await props.cont.get_quiz_list(now, now - add_num.current);
                props.now_numRef.current = now - add_num.current;
            }

            props.Set_quiz_list((quiz_list) => {
                const existingIds = new Set(
                    quiz_list.map((item) => `${item?.sourceAddress || item?.[12] || ""}:${Number(item?.[0])}`)
                );
                const nextItems = add_quiz_list.filter(
                    (item) => !existingIds.has(`${item?.sourceAddress || item?.[12] || ""}:${Number(item?.[0])}`)
                );
                return [...quiz_list, ...nextItems];
            });
            props.setLoadError?.("");
        } catch (error) {
            console.error("Failed to load edit quiz list batch", error);
            props.setLoadError?.("管理用クイズ一覧の読み込みに失敗しました。再読み込みしてください。");
        } finally {
            isLoadingRef.current = false;
        }
    };

    useEffect(() => {
        get_quiz_list(props.now_numRef.current);

        if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") {
            return undefined;
        }

        const observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    get_quiz_list(props.now_numRef.current);
                }
            }
        }, {
            root: null,
            rootMargin: "240px",
            threshold: 0,
        });

        const targetElement = props.targetRef.current;
        if (targetElement) {
            observer.observe(targetElement);
        }

        return () => {
            if (targetElement) {
                observer.unobserve(targetElement);
            }
            observer.disconnect();
        };
        // location is intentionally referenced so list resets on route change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.key, props.quiz_sum, props.refreshKey]);

    return null;
}

export default Quiz_list;
