package br.com.senac.recursos.professor;

import java.util.UUID;

/** {@code restrito} é só leitura: reserva com professor restrito precisa de aprovação (RF-07). */
public record ProfessorResponse(UUID id, String codigo, String nome, String competencia, boolean restrito) {

    public ProfessorResponse(UUID id, String codigo, String nome, String competencia) {
        this(id, codigo, nome, competencia, false);
    }

    static ProfessorResponse from(Professor professor) {
        return new ProfessorResponse(
                professor.getId(),
                professor.getCodigo(),
                professor.getNome(),
                professor.getCompetencia(),
                professor.isRestrito());
    }
}
