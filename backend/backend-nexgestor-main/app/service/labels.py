"""
Rótulos visíveis dos valores fechados (Literal) do schema.

Fonte única — evita a mesma divergência que a revisão da PR7 (fase-5) achou
entre catálogo público e prompt da IA (dois lugares nomeando a mesma coisa
diferente). `app/service/prompts.py` e `app/service/benchmark_service.py`
importam daqui; nenhum dos dois declara sua própria cópia.

Espelha os Literal de `app/schema/schema.py` — manter em sincronia.
"""

PLATFORM_LABELS = {
    "meta_ads": "Meta Ads",
    "google_ads": "Google Ads",
    "tiktok_ads": "TikTok Ads",
    "linkedin_ads": "LinkedIn Ads",
}

OBJECTIVE_LABELS = {
    "conversion": "Conversão",
    "lead": "Geração de Leads",
    "traffic": "Tráfego",
}

# Espelha CampaignNiche (fase-2b, benchmark de mercado — ver
# docs/prds/fase-2b-benchmark-mercado.md §3.2/§3.3).
NICHE_LABELS = {
    "ecommerce_varejo": "E-commerce / Varejo",
    "educacao_cursos": "Educação e Cursos",
    "saude_bem_estar": "Saúde e Bem-estar",
    "beleza_estetica": "Beleza e Estética",
    "imobiliario": "Imobiliário",
    "servicos_financeiros_seguros": "Serviços Financeiros e Seguros",
    "servicos_juridicos": "Serviços Jurídicos",
    "automotivo": "Automotivo",
    "viagens_turismo": "Viagens e Turismo",
    "alimentacao_restaurantes": "Alimentação e Restaurantes",
    "software_tecnologia_b2b": "Software e Tecnologia (B2B)",
    "fitness_academias": "Fitness e Academias",
    "servicos_locais": "Serviços Locais (reformas, manutenção)",
    "pet": "Pet",
    "moda_vestuario": "Moda e Vestuário",
}
