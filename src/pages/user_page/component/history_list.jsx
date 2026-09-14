import { useEffect, useRef } from "react";
import Simple_history from "./history_simple";

function getInitialBatchSize() {
    if (typeof window === "undefined") return 8;
    return Math.max(8, Math.floor(window.innerHeight / 100) + 2);
}

function History_list(props) {
    const add_num = useRef(getInitialBatchSize());
    const isLoadingRef = useRef(false);

    const get_history_list = async (now_sum) => {
        if (isLoadingRef.current || now_sum <= 0) return;
        isLoadingRef.current = true;
        let add_history_list = [];
        try {
            if (now_sum - add_num.current < 0) {
                add_history_list = await props.cont.get_token_history(props.address, now_sum, 0);
                props.now_numRef.current = 0;
            } else {
                add_history_list = await props.cont.get_token_history(props.address, now_sum, now_sum - add_num.current);
                props.now_numRef.current = now_sum - add_num.current;
            }

            const nextHistoryItems = (Array.isArray(add_history_list) ? add_history_list : []).map((history, index) => (
                <Simple_history
                    key={`${props.address}_${props.now_numRef.current}_${index}_${history?.[0] || history?._from || "history"}`}
                    history={history}
                />
            ));
            props.Set_history_list((history_list) => [...history_list, ...nextHistoryItems]);
        } finally {
            isLoadingRef.current = false;
        }
    };

    const options = {
        root: null, // ビューポートをルートとする
        rootMargin: "-10px", // ビューポートに対するマージン
        threshold: 0, // ターゲット要素が完全にビューポートに入った時にコールバックを実行
    };

    useEffect(() => {
        props.Set_history_list([]);
        if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") {
            get_history_list(props.now_numRef.current);
            return undefined;
        }

        const observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    get_history_list(props.now_numRef.current);
                }
            }
        }, options);

        const targetElement = props.targetRef.current; // ターゲット要素を取得
        if (targetElement) {
            observer.observe(targetElement); // ターゲット要素をobserve
        }
        return () => {
            if (targetElement) {
                observer.unobserve(targetElement);
            }
            observer.disconnect();
        };
    }, [props.address, props.history_sum]);

    return null;
}
export default History_list;
